const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnalysisClient, toAnalysisPayload } = require('../src/analysis-client.js');

const material = {
  id: 'task-1:xhs:note-1',
  title: '标题',
  author: '作者',
  bodyText: '正文',
  sourceUrl: 'https://www.xiaohongshu.com/explore/note-1',
  openUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=secret',
  capturedAt: '2026-08-09T09:00:00.000Z',
  contentHash: 'v1-abcd1234',
  coverUrl: 'https://image.example/cover.jpg',
  imageUrls: ['https://image.example/1.jpg'],
};

test('builds an explicit allowlist payload', () => {
  const payload = toAnalysisPayload(material);
  assert.deepEqual(Object.keys(payload).sort(), [
    'author', 'bodyText', 'capturedAt', 'contentHash', 'materialId', 'sourceUrl', 'title',
  ]);
  assert.equal(JSON.stringify(payload).includes('secret'), false);
});

test('posts to the fixed material brief endpoint', async () => {
  const calls = [];
  const client = createAnalysisClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ status: 'insufficient', message: '正文不足' }) };
    },
  });
  const result = await client.summarize(material);
  assert.equal(result.status, 'insufficient');
  assert.equal(calls[0].url, 'http://127.0.0.1:8765/api/v1/material-briefs');
});

test('maps backend errors without exposing response input', async () => {
  const client = createAnalysisClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({
      ok: false,
      json: async () => ({
        detail: {
          code: 'provider_read_timeout',
          message: '模型响应超时',
          retryable: true,
          diagnosticId: 'A1B2C3D4',
        },
      }),
    }),
  });
  await assert.rejects(
    () => client.summarize(material),
    (error) => error.code === 'provider_read_timeout'
      && error.retryable === true
      && error.diagnosticId === 'A1B2C3D4',
  );
});

test('rejects an unknown success status as a retryable contract error', async () => {
  const client = createAnalysisClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({ ok: true, json: async () => ({ status: 'done' }) }),
  });
  await assert.rejects(
    () => client.summarize(material),
    (error) => error.code === 'invalid_backend_response' && error.retryable === true,
  );
});

test('requires a succeeded response to contain a matching brief identity', async () => {
  const invalidPayloads = [
    { status: 'succeeded' },
    { status: 'succeeded', brief: {} },
    {
      status: 'succeeded',
      brief: { materialId: material.id, contentHash: 'v1-wronghash' },
    },
  ];

  for (const payload of invalidPayloads) {
    const client = createAnalysisClient({
      baseUrl: 'http://127.0.0.1:8765',
      fetchFn: async () => ({ ok: true, json: async () => payload }),
    });
    await assert.rejects(
      () => client.summarize(material),
      (error) => error.code === 'invalid_backend_response' && error.retryable === true,
    );
  }
});

test('maps invalid JSON in a 2xx response to a retryable contract error', async () => {
  const client = createAnalysisClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid json'); } }),
  });
  await assert.rejects(
    () => client.summarize(material),
    (error) => error.code === 'invalid_backend_response' && error.retryable === true,
  );
});
