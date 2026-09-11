const test = require('node:test');
const assert = require('node:assert/strict');
const { createDirectAiClient, prepareReportBrief } = require('../src/direct-ai-client');
const { validateDirectReport } = require('../src/direct-report-validator');
const { resolveReportCitation } = require('../src/ui-model');

const material = { id: 'm1', contentHash: 'h1', title: '深圳路线', bodyText: '从公园出发。\n沿步道到海边。', taskId: 't1' };
const legacy = { materialId: 'm1', contentHash: 'h1', summary: '游玩摘要', facts: ['不能作为原文的模型总结'] };

test('legacy brief gains deterministic verbatim evidence without changing saved input', () => {
  const result = prepareReportBrief(material, legacy);
  assert.deepEqual(result.evidence, [{ id: 'E1', quote: '从公园出发。' }, { id: 'E2', quote: '沿步道到海边。' }]);
  assert.deepEqual(result, prepareReportBrief(material, legacy));
  assert.equal(legacy.evidence, undefined);
  assert.equal(result.summary, legacy.summary);
});

test('long source evidence is bounded per quote without dropping the end of the source', () => {
  const bodyText = '深'.repeat(600) + '最后的原文';
  const result = prepareReportBrief({ ...material, bodyText }, legacy);
  assert.equal(result.evidence.map((item) => item.quote).join(''), bodyText);
  assert.ok(result.evidence.every((item) => item.quote.length <= 240));
});

test('source chunk boundaries preserve numeric facts and their units', () => {
  for (const padding of [238, 239]) {
    const bodyText = '深'.repeat(padding) + '20元';
    const brief = prepareReportBrief({ ...material, bodyText }, legacy);
    assert.equal(brief.evidence.map((item) => item.quote).join(''), bodyText);
    const request = { selectedMaterials: [brief] };
    const report = reportFor(request, brief.evidence.map((item) => item.id));
    report.executiveSummary = '门票20元。';
    assert.doesNotThrow(() => validateDirectReport(report, request));
  }
});

test('source chunk boundaries never split an emoji surrogate pair', () => {
  const bodyText = '深'.repeat(239) + '😀' + '门票20元。';
  const result = prepareReportBrief({ ...material, bodyText }, legacy);
  assert.ok(result.evidence.every((item) => item.quote.isWellFormed()));
  assert.equal(result.evidence.map((item) => item.quote).join(''), bodyText);
  assert.doesNotThrow(() => prepareReportBrief({ ...material, bodyText }, result));
});

test('legacy evidence corrupted by surrogate storage is migrated without changing citation ids', () => {
  const bodyText = '深'.repeat(239) + '😀' + '门票20元。';
  const broken = [{ id: 'E1', quote: bodyText.slice(0, 240) }, { id: 'E2', quote: bodyText.slice(240) }];
  const result = prepareReportBrief({ ...material, bodyText }, { ...legacy, evidence: broken });
  assert.deepEqual(result.evidence.map((item) => item.id), ['E1', 'E2']);
  assert.ok(result.evidence.every((item) => item.quote.isWellFormed()));
  assert.equal(result.evidence.map((item) => item.quote).join(''), bodyText);
  const replacement = prepareReportBrief({ ...material, bodyText }, { ...legacy, evidence: [{ id: 'E1', quote: `${'深'.repeat(239)}�` }, { id: 'E2', quote: '门票20元。' }] });
  assert.equal(replacement.evidence.map((item) => item.quote).join(''), bodyText);
});

test('existing verified evidence ids are preserved', () => {
  const brief = { ...legacy, evidence: [{ id: 'E7', quote: '沿步道到海边。' }] };
  assert.deepEqual(prepareReportBrief(material, brief), brief);
});

test('missing source, mismatched identity and fabricated existing evidence are rejected', () => {
  assert.throws(() => prepareReportBrief({ ...material, bodyText: '' }, legacy), /原文/);
  assert.throws(() => prepareReportBrief(material, { ...legacy, contentHash: 'old' }), /素材/);
  assert.throws(() => prepareReportBrief(material, { ...legacy, materialId: 'other' }), /素材/);
  assert.throws(() => prepareReportBrief(material, { ...legacy, evidence: [{ id: 'E1', quote: '不存在的原文' }] }), /证据/);
  assert.throws(() => prepareReportBrief(material, { ...legacy, evidence: [{ id: 'E1', quote: '从公园出发。' }, { id: 'E1', quote: '沿步道到海边。' }] }), /证据/);
});

function reportFor(request, evidenceIds = ['E1']) {
  return {
    reportId: 'r1', sourceRevision: request.sourceRevision, goalUnderstanding: '整理深圳路线', executiveSummary: '根据素材从公园出发。',
    themes: [], conflicts: [], informationGaps: [], nextActions: [{ text: '从公园出发。', origin: 'source', citationIds: ['C1'] }],
    preflightActions: [], supplements: [], citations: [{ id: 'C1', materialId: 'm1', evidenceIds }], confidence: 'medium', modelVersion: 'demo',
  };
}

test('fresh summary flows through report generation and resolves citations to original source', async () => {
  const client = createDirectAiClient({ complete: async ({ messages }) => {
    const request = JSON.parse(messages[1].content);
    if (request.task === 'summarize_material') {
      assert.ok(request.material.evidence?.length, 'summary input must include source evidence');
      return { content: JSON.stringify({ summary: '深圳游玩摘要', facts: [], evidence: [{ id: 'fake', quote: '模型伪造' }] }) };
    }
    assert.match(messages[0].content, /evidenceIds/);
    assert.match(messages[0].content, /citationIds/);
    assert.ok(request.reportFormat?.citations[0].evidenceIds, 'report must receive the citation shape');
    return { content: JSON.stringify(reportFor(request)) };
  } });
  const { brief } = await client.summarize(material, {});
  assert.equal(brief.evidence[0].quote, '从公园出发。');
  const request = { goal: '整理深圳路线', sourceRevision: 'rev1', selectedMaterials: [brief], supplementMode: 'source_only' };
  const report = await client.generateReport(request, {});
  const resolved = resolveReportCitation(report.citations[0], [material], [{ materialId: material.id, status: 'succeeded', brief }]);
  assert.deepEqual(resolved.quotes, ['从公园出发。']);
});

test('unknown evidence ids remain rejected after legacy migration', () => {
  const request = { sourceRevision: 'rev1', selectedMaterials: [prepareReportBrief(material, legacy)] };
  assert.throws(() => validateDirectReport(reportFor(request, ['fake']), request), /未知证据/);
});

test('empty evidence references and model-written source quotes cannot bypass validation', () => {
  const request = { selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'E1', quote: '从公园出发。' }] }] };
  assert.throws(() => validateDirectReport(reportFor(request, []), request), /证据/);
  const report = reportFor(request);
  report.citations[0].quote = '门票999元';
  report.executiveSummary = '门票999元';
  assert.throws(() => validateDirectReport(report, request), /数字|证据/);
});

test('numeric evidence is checked against the source rather than an optional model quote', () => {
  const request = { selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'E1', quote: '门票20元。' }] }] };
  const report = reportFor(request);
  report.executiveSummary = '门票20元。';
  assert.doesNotThrow(() => validateDirectReport(report, request));
});
