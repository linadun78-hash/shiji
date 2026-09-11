const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnalysisCoordinator } = require('../src/analysis-coordinator.js');

function fakeAnalysisRepository(materials) {
  const calls = [];
  const records = materials.map((item) => ({
    materialId: item.id, contentHash: item.contentHash, status: 'pending',
  }));
  return {
    calls,
    getState: () => ({ enabled: true, records }),
    getRecord: (id) => records.find((item) => item.materialId === id) || null,
    getNextPending: () => materials.find((item) => (
      records.find((record) => record.materialId === item.id).status === 'pending'
    )) || null,
    ensureMaterial: async (material) => records.find((item) => item.materialId === material.id),
    markProcessing: async (id) => {
      records.find((item) => item.materialId === id).status = 'processing';
      calls.push(['processing', id]);
      return true;
    },
    applyResult: async (id, hash, brief) => {
      records.find((item) => item.materialId === id).status = 'succeeded';
      calls.push(['succeeded', id, brief]);
      return true;
    },
    markInsufficient: async (id, hash, message) => {
      records.find((item) => item.materialId === id).status = 'insufficient';
      calls.push(['insufficient', id, message]);
      return true;
    },
    markFailed: async (id, hash, error) => {
      records.find((item) => item.materialId === id).status = 'failed';
      calls.push(['failed', id, error]);
      return true;
    },
    retry: async (id) => {
      const record = records.find((item) => item.materialId === id);
      if (!record || record.status !== 'failed') return false;
      record.status = 'pending';
      calls.push(['retry', id]);
      return true;
    },
  };
}

test('processes one material through succeeded states', async () => {
  const materials = [{ id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' }];
  const analysisRepository = fakeAnalysisRepository(materials);
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: { summarize: async () => ({ status: 'succeeded', brief: { oneLineSummary: '摘要' } }) },
  });
  await coordinator.processMaterial('m1');
  assert.deepEqual(analysisRepository.calls.map((item) => item[0]), ['processing', 'succeeded']);
});

test('maps network failure to a safe retryable state', async () => {
  const materials = [{ id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' }];
  const analysisRepository = fakeAnalysisRepository(materials);
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async () => {
        throw Object.assign(new Error('无法连接整理服务'), {
          code: 'backend_unreachable', retryable: true,
        });
      },
    },
  });
  await coordinator.processMaterial('m1');
  assert.equal(analysisRepository.calls.at(-1)[0], 'failed');
  assert.equal(analysisRepository.calls.at(-1)[2].code, 'backend_unreachable');
});

test('stores provider diagnostic id with a failed material', async () => {
  const materials = [{ id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' }];
  const analysisRepository = fakeAnalysisRepository(materials);
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async () => {
        throw Object.assign(new Error('模型响应超时'), {
          code: 'provider_read_timeout', retryable: true, diagnosticId: 'A1B2C3D4',
        });
      },
    },
  });

  await coordinator.processMaterial('m1');

  assert.deepEqual(analysisRepository.calls.at(-1)[2], {
    code: 'provider_read_timeout',
    message: '模型响应超时',
    retryable: true,
    diagnosticId: 'A1B2C3D4',
  });
});

test('stores insufficient source without inventing a brief', async () => {
  const materials = [{ id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' }];
  const analysisRepository = fakeAnalysisRepository(materials);
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: { summarize: async () => ({ status: 'insufficient', message: '当前正文不足' }) },
  });
  await coordinator.processMaterial('m1');
  assert.equal(analysisRepository.calls.at(-1)[0], 'insufficient');
});

test('drains pending materials with one request at a time', async () => {
  const materials = [
    { id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' },
    { id: 'm2', contentHash: 'v1-bbbbbbbb', capturedAt: '2026-08-09T09:01:00Z' },
  ];
  const analysisRepository = fakeAnalysisRepository(materials);
  let active = 0;
  let maximumActive = 0;
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return { status: 'succeeded', brief: { oneLineSummary: '摘要' } };
      },
    },
  });
  await coordinator.drain();
  assert.equal(maximumActive, 1);
  assert.deepEqual(
    analysisRepository.calls.filter((item) => item[0] === 'succeeded').map((item) => item[1]),
    ['m1', 'm2'],
  );
});

test('serializes direct analysis and drain calls through one global queue', async () => {
  const materials = [
    { id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' },
    { id: 'm2', contentHash: 'v1-bbbbbbbb', capturedAt: '2026-08-09T09:01:00Z' },
  ];
  const analysisRepository = fakeAnalysisRepository(materials);
  let active = 0;
  let maximumActive = 0;
  let releaseFirst;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  let signalFirstStarted;
  const firstStarted = new Promise((resolve) => { signalFirstStarted = resolve; });
  let callCount = 0;
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async () => {
        callCount += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (callCount === 1) {
          signalFirstStarted();
          await firstBlocked;
        }
        active -= 1;
        return { status: 'succeeded', brief: { oneLineSummary: '摘要' } };
      },
    },
  });

  const direct = coordinator.processMaterial('m1');
  await firstStarted;
  const drained = coordinator.drain();
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirst();
  await Promise.all([direct, drained]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(
    analysisRepository.calls.filter((item) => item[0] === 'succeeded').map((item) => item[1]),
    ['m1', 'm2'],
  );
});

test('serializes retry with an analysis already in flight', async () => {
  const materials = [
    { id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' },
    { id: 'm2', contentHash: 'v1-bbbbbbbb', capturedAt: '2026-08-09T09:01:00Z' },
  ];
  const analysisRepository = fakeAnalysisRepository(materials);
  analysisRepository.getRecord('m2').status = 'failed';
  let active = 0;
  let maximumActive = 0;
  let releaseFirst;
  let signalFirstStarted;
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  const firstStarted = new Promise((resolve) => { signalFirstStarted = resolve; });
  let callCount = 0;
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async () => {
        callCount += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (callCount === 1) {
          signalFirstStarted();
          await firstBlocked;
        }
        active -= 1;
        return { status: 'succeeded', brief: { oneLineSummary: '摘要' } };
      },
    },
  });

  const direct = coordinator.processMaterial('m1');
  await firstStarted;
  const retried = coordinator.retryMaterial('m2');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(analysisRepository.getRecord('m2').status, 'failed');
  releaseFirst();
  await Promise.all([direct, retried]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(
    analysisRepository.calls.filter((item) => item[0] === 'succeeded').map((item) => item[1]),
    ['m1', 'm2'],
  );
});

test('retries retryable failures before draining the remaining queue', async () => {
  const materials = [
    { id: 'm1', contentHash: 'v1-aaaaaaaa', capturedAt: '2026-08-09T09:00:00Z' },
    { id: 'm2', contentHash: 'v1-bbbbbbbb', capturedAt: '2026-08-09T09:01:00Z' },
  ];
  const analysisRepository = fakeAnalysisRepository(materials);
  analysisRepository.getRecord('m1').status = 'failed';
  analysisRepository.getRecord('m1').error = { code: 'backend_unreachable', retryable: true };
  let attempts = 0;
  const coordinator = createAnalysisCoordinator({
    materialRepository: { getState: () => ({ materials }) },
    analysisRepository,
    client: {
      summarize: async (material) => {
        attempts += 1;
        return { status: 'succeeded', brief: { materialId: material.id, oneLineSummary: '摘要' } };
      },
    },
  });

  await coordinator.retryAll(['m1', 'm2']);

  assert.equal(attempts, 2);
  assert.deepEqual(
    analysisRepository.calls.filter((item) => item[0] === 'succeeded').map((item) => item[1]),
    ['m1', 'm2'],
  );
});
