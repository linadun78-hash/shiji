const test = require('node:test');
const assert = require('node:assert/strict');
const { createDirectAiClient } = require('../src/direct-ai-client');

test('direct client converts a JSON material response into the existing brief contract', async () => {
  const client = createDirectAiClient({ complete: async () => ({ content: JSON.stringify({ summary: '摘要', facts: ['事实'] }) }) });
  const result = await client.summarize({ id: 'm1', title: '标题', bodyText: '正文', contentHash: 'h1' }, { baseUrl: 'https://x', model: 'm', apiKey: 'k' });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.brief.materialId, 'm1');
  assert.equal(result.brief.contentHash, 'h1');
  assert.equal(result.brief.summary, '摘要');
});

test('direct client rejects non-JSON model output without inventing a brief', async () => {
  const client = createDirectAiClient({ complete: async () => ({ content: 'not json' }) });
  await assert.rejects(client.summarize({ id: 'm1', title: '标题', bodyText: '正文', contentHash: 'h1' }, {}), (error) => error.code === 'invalid_backend_response');
});

test('direct client generates a report using the existing report field contract', async () => {
  const report = { reportId: 'r1', sourceRevision: 'rev-1', goalUnderstanding: '目标说明', executiveSummary: '这是一个充分长度的摘要。', themes: [], conflicts: [], informationGaps: [], nextActions: [], preflightActions: [], supplements: [], citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['e1'], quote: '证据' }], confidence: 'medium', modelVersion: 'demo' };
  let request;
  const client = createDirectAiClient({ complete: async (input) => {
    request = input;
    return { content: JSON.stringify(report) };
  } });
  const result = await client.generateReport({ goal: '完成一个任务', constraints: [], selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'e1', quote: '证据' }] }], sourceRevision: 'rev-1' }, {});
  assert.equal(result.reportId, 'r1');
  assert.deepEqual(result.citations[0].evidenceIds, ['e1']);
  assert.equal(request.timeoutMs, 120000);
});

test('report timeout is displayed with report-specific wording', async () => {
  const client = createDirectAiClient({ complete: async () => {
    throw Object.assign(new Error('模型请求超时'), { code: 'provider_timeout' });
  } });
  await assert.rejects(client.generateReport({}, {}), { code: 'provider_timeout', message: '报告生成超时，请稍后重试' });
});

test('report generation preserves non-timeout errors', async () => {
  const failure = Object.assign(new Error('无法连接模型服务'), { code: 'provider_network_error' });
  const client = createDirectAiClient({ complete: async () => { throw failure; } });
  await assert.rejects(client.generateReport({}, {}), (error) => error === failure);
});
