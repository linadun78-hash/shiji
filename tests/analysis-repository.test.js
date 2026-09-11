const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStorage } = require('../src/repository.js');
const { ANALYSIS_STATE_KEY, createAnalysisRepository } = require('../src/analysis-repository.js');

async function setup() {
  const storage = createMemoryStorage();
  const repository = createAnalysisRepository(storage, { now: () => '2026-08-09T10:00:00.000Z' });
  await repository.initialize();
  return { repository, storage };
}

const material = {
  id: 'task-1:xhs:note-1',
  contentHash: 'v1-abcd1234',
  capturedAt: '2026-08-09T09:00:00.000Z',
};

test('initializes AI disabled under a separate storage key', async () => {
  const { repository, storage } = await setup();
  assert.deepEqual(repository.getState(), {
    version: 1, enabled: false, consentedAt: '', records: [],
  });
  const raw = await storage.get(ANALYSIS_STATE_KEY);
  assert.equal(raw[ANALYSIS_STATE_KEY].version, 1);
});

test('creates one pending record when content is unchanged', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  await repository.ensureMaterial({ ...material });
  assert.equal(repository.getRecord(material.id).status, 'pending');
  assert.equal(repository.getRecord(material.id).revision, 1);
});

test('resets changed content without touching raw material storage', async () => {
  const { repository, storage } = await setup();
  await repository.ensureMaterial(material);
  await repository.ensureMaterial({ ...material, contentHash: 'v1-eeeeeeee' });
  const record = repository.getRecord(material.id);
  assert.equal(record.status, 'pending');
  assert.equal(record.brief, null);
  assert.equal(record.revision, 2);
  assert.deepEqual((await storage.get('xhsCollectorState')).xhsCollectorState, undefined);
});

test('enables AI only after explicit consent', async () => {
  const { repository } = await setup();
  await repository.enable('2026-08-09T10:05:00.000Z');
  assert.equal(repository.getState().enabled, true);
  assert.equal(repository.getState().consentedAt, '2026-08-09T10:05:00.000Z');
});

test('applies result only when expected content hash still matches', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  await repository.markProcessing(material.id, material.contentHash);
  await repository.ensureMaterial({ ...material, contentHash: 'v1-eeeeeeee' });
  const applied = await repository.applyResult(
    material.id,
    material.contentHash,
    { oneLineSummary: '过期摘要' },
  );
  assert.equal(applied, false);
  assert.equal(repository.getRecord(material.id).status, 'pending');
});

test('allows only one caller to atomically claim a pending record', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);

  const [first, second] = await Promise.all([
    repository.markProcessing(material.id, material.contentHash),
    repository.markProcessing(material.id, material.contentHash),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);
  assert.equal(repository.getRecord(material.id).status, 'processing');
});

test('rejects a late result from an interrupted processing attempt', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  const firstAttempt = await repository.markProcessing(material.id, material.contentHash);
  await repository.requeueInterrupted();
  const secondAttempt = await repository.markProcessing(material.id, material.contentHash);

  const lateApplied = await repository.applyResult(
    material.id,
    material.contentHash,
    { oneLineSummary: '晚到的旧结果' },
    firstAttempt.revision,
  );

  assert.equal(lateApplied, false);
  assert.equal(repository.getRecord(material.id).status, 'processing');
  assert.equal(repository.getRecord(material.id).revision, secondAttempt.revision);
});

test('retry invalidates the revision of an older failed attempt', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  const attempt = await repository.markProcessing(material.id, material.contentHash);
  await repository.markFailed(
    material.id,
    material.contentHash,
    { code: 'provider_timeout', message: '超时', retryable: true },
    attempt.revision,
  );

  const retried = await repository.retry(material.id);

  assert.equal(retried, true);
  assert.equal(repository.getRecord(material.id).status, 'pending');
  assert.equal(repository.getRecord(material.id).revision, attempt.revision + 1);
});

test('stores safe retryable failure without raw source fields', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  await repository.markFailed(material.id, material.contentHash, {
    code: 'provider_timeout', message: '模型响应超时', retryable: true,
  });
  const record = repository.getRecord(material.id);
  assert.equal(record.status, 'failed');
  assert.equal(record.error.code, 'provider_timeout');
  assert.equal('bodyText' in record, false);
});

test('requeues processing records after service worker restart', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  await repository.markProcessing(material.id, material.contentHash);
  await repository.requeueInterrupted();
  assert.equal(repository.getRecord(material.id).status, 'pending');
});

test('prunes analysis records whose raw material was deleted', async () => {
  const { repository } = await setup();
  await repository.ensureMaterial(material);
  await repository.pruneMissing([]);
  assert.equal(repository.getRecord(material.id), null);
});
