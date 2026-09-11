const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDirectAiClient, prepareReportBrief } = require('../src/direct-ai-client');
const { getBriefView } = require('../src/ui-model');

const material = { id: 'm1', title: '深圳路线', bodyText: '公园\n出发，门票20元。', contentHash: 'h1' };
const brief = { materialId: 'm1', contentHash: 'h1', summary: '路线摘要', evidence: [{ id: 'E1', quote: '公园 出发，门票20元。' }] };

test('whitespace-only evidence differences resolve to the exact original span', () => {
  const result = prepareReportBrief(material, brief);
  assert.deepEqual(result.evidence, [{ id: 'E1', quote: material.bodyText }]);
  assert.equal(brief.evidence[0].quote, '公园 出发，门票20元。');
  assert.strictEqual(prepareReportBrief(material, result), result);
});

test('different words, removed numeric boundaries and repeated ids remain invalid with useful diagnostics', () => {
  for (const evidence of [
    [{ id: 'E1', quote: '公园 出发，门票200元。' }],
    [{ id: 'E1', quote: '公园' }, { id: 'E1', quote: '出发' }],
    [{ id: 'E1', quote: '' }],
  ]) {
    assert.throws(() => prepareReportBrief(material, { ...brief, evidence }), (error) => {
      assert.equal(error.code, 'invalid_material_evidence');
      assert.equal(error.materialId, 'm1');
      assert.match(error.message, /深圳路线.*E1/);
      return true;
    });
  }
  assert.throws(() => prepareReportBrief({ ...material, bodyText: '2 0元' }, { ...brief, evidence: [{ id: 'E1', quote: '20元' }] }), /证据/);
});

test('new direct summaries populate existing display fields without fabricated citation ids', async () => {
  const client = createDirectAiClient({ complete: async () => ({ content: JSON.stringify({ summary: '路线摘要', facts: ['事实'], actions: ['出发'], risks: ['待确认'] }) }) });
  const { brief: result } = await client.summarize(material, {});
  assert.equal(result.oneLineSummary, '路线摘要');
  assert.deepEqual(result.keyPoints, ['事实']);
  assert.deepEqual(result.warnings, ['待确认']);
  assert.deepEqual(result.actions, ['出发']);
  assert.equal(result.oneLineSummaryEvidenceIds, undefined);
});

test('legacy display compatibility preserves canonical fields and does not modify storage objects', () => {
  const legacy = { summary: '旧摘要', facts: ['旧事实'], risks: ['旧风险'] };
  const result = getBriefView(legacy);
  assert.equal(result.oneLineSummary, '旧摘要');
  assert.deepEqual(result.keyPoints, ['旧事实']);
  assert.deepEqual(result.warnings, ['旧风险']);
  assert.equal(legacy.oneLineSummary, undefined);
  assert.equal(getBriefView({ ...legacy, oneLineSummary: '新摘要', keyPoints: [] }).oneLineSummary, '新摘要');
  assert.deepEqual(getBriefView({ ...legacy, keyPoints: [] }).keyPoints, []);
  assert.equal(typeof getBriefView({}).oneLineSummary, 'string');
});

test('material rendering normalizes legacy briefs at its common entry point', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src/content.js'), 'utf8');
  const body = content.slice(content.indexOf('function materialWithAnalysis('));
  assert.match(body.slice(0, body.indexOf('\n  function ', 10)), /XhsUiModel\.getBriefView/);
});
