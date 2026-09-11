const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDirectReport } = require('../src/direct-report-validator');

function request(overrides = {}) {
  return { supplementMode: 'source_only', selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'e1', quote: '真实证据' }] }], ...overrides };
}
function report(overrides = {}) {
  return { reportId: 'r', sourceRevision: 'rev', goalUnderstanding: '目标', executiveSummary: '摘要', themes: [], conflicts: [], informationGaps: [], nextActions: [], preflightActions: [], supplements: [], citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['e1'], quote: '真实证据' }], confidence: 'medium', modelVersion: 'm', ...overrides };
}

test('accepts citations that resolve to selected evidence', () => {
  assert.doesNotThrow(() => validateDirectReport(report(), request()));
});

test('rejects unknown evidence and uncited source statements', () => {
  assert.throws(() => validateDirectReport(report({ citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['missing'], quote: 'x' }] }), request()), /引用|证据/);
  assert.throws(() => validateDirectReport(report({ themes: [{ text: '来源结论', citationIds: [], origin: 'source' }] }), request()), /引用/);
});

test('rejects supplements in source-only mode', () => {
  assert.throws(() => validateDirectReport(report({ supplements: [{ text: '补充', origin: 'ai_supplement', verificationStatus: 'needs_verification', verificationNote: '可能变化' }] }), request()), /补充/);
});

test('rejects unsupported numeric and unqualified relative-time claims', () => {
  assert.throws(() => validateDirectReport(report({ themes: [{ text: '价格 999 元', citationIds: ['C1'], origin: 'source' }] }), request()), /数字|数量/);
  assert.throws(() => validateDirectReport(report({ executiveSummary: '今天可以完成。' }), request()), /时间/);
});
