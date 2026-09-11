const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDirectReport } = require('../src/direct-report-validator');

function request(quote = '从公园出发。', overrides = {}) {
  return { goal: '整理深圳路线', constraints: [], selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'E1', quote }] }], ...overrides };
}
function report(overrides = {}) {
  return { goalUnderstanding: '整理深圳路线', executiveSummary: '从公园出发。', themes: [], conflicts: [], nextActions: [], informationGaps: [], preflightActions: [],
    citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['E1'] }], ...overrides };
}
function statement(text, overrides = {}) {
  return { text, origin: 'source', citationIds: ['C1'], ...overrides };
}

test('numeric whitespace is normalized in both source and report', () => {
  for (const [quote, text] of [['门票20元。', '门票20 元。'], ['门票20 元。', '门票20元。'], ['全程2 km。', '全程2km。']]) {
    assert.doesNotThrow(() => validateDirectReport(report({ themes: [statement(text)] }), request(quote)));
  }
});

test('line-leading list markers do not become quantitative claims', () => {
  for (const text of ['1. 从公园出发。', '1) 从公园出发。', '1、 从公园出发。', '1. 从公园出发。\n2. 沿步道前行。']) {
    assert.doesNotThrow(() => validateDirectReport(report({ nextActions: [statement(text)] }), request()));
  }
});

test('list handling does not erase decimal quantities, days, times or numbered places', () => {
  for (const text of ['1.5公里到达', '第1天出发', '9:30到达', '2号线出发', '1. 花费999元']) {
    assert.throws(() => validateDirectReport(report({ nextActions: [statement(text)] }), request()), /数字|数量/);
  }
});

test('explicit user budget and time constraints support goal and user statements', () => {
  const constraints = ['预算800元', '不安排早于9点的行程'];
  const result = report({ goalUnderstanding: '预算800 元，不安排早于9 点的行程。',
    executiveSummary: '按预算800元规划，具体费用待确认。',
    themes: constraints.map((text) => statement(text, { origin: 'user', citationIds: [] })),
    informationGaps: ['预算800元是否足够，素材未提供依据。'],
  });
  assert.doesNotThrow(() => validateDirectReport(result, request(undefined, { constraints })));
});

test('user goal numbers are allowed without an explicit constraints array', () => {
  assert.doesNotThrow(() => validateDirectReport(report({ goalUnderstanding: '规划2天行程' }), request(undefined, { goal: '规划2天行程' })));
});

test('placeholder budgets, invented user quantities and source prices are not authorized by user budgets', () => {
  assert.throws(() => validateDirectReport(report({ goalUnderstanding: '预算800元' }), request()), /数字|数量/);
  const input = request(undefined, { constraints: ['预算800元'] });
  assert.throws(() => validateDirectReport(report({ themes: [statement('门票800元')] }), input), /数字|数量/);
  assert.throws(() => validateDirectReport(report({ themes: [statement('预算999元', { origin: 'user', citationIds: [] })] }), input), /数字|数量|用户/);
  assert.throws(() => validateDirectReport(report({ themes: [statement('门票800元', { origin: 'user', citationIds: [] })] }), input), /用户/);
});

test('user statements cannot carry source citations', () => {
  assert.throws(() => validateDirectReport(report({ themes: [statement('预算800元', { origin: 'user' })] }), request('预算800元', { constraints: ['预算800元'] })), /用户/);
});

test('source statements cannot borrow numbers from unrelated citations', () => {
  const input = request();
  input.selectedMaterials[0].evidence.push({ id: 'E2', quote: '另一景点门票20元。' });
  const result = report({ themes: [statement('门票20元。')] });
  result.citations.push({ id: 'C2', materialId: 'm1', evidenceIds: ['E2'] });
  assert.throws(() => validateDirectReport(result, input), /数字|数量/);
});

test('numeric support uses complete tokens, not substrings or joined evidence boundaries', () => {
  for (const [source, claim] of [['120元', '20元'], ['20元', '20小时'], ['1.5公里', '5公里']]) {
    assert.throws(() => validateDirectReport(report({ executiveSummary: claim }), request(source)), /数字|数量/);
  }
  const input = request('2');
  input.selectedMaterials[0].evidence.push({ id: 'E2', quote: '0元' });
  const result = report({ executiveSummary: '20元' });
  result.citations[0].evidenceIds.push('E2');
  assert.throws(() => validateDirectReport(result, input), /数字|数量/);
});

test('preflight steps are checked against their actual source citations', () => {
  const result = report({ preflightActions: [{ title: '准备', purpose: '出发', steps: ['花费999元'], successCheck: '完成', fallback: '待确认', origin: 'source', citationIds: ['C1'] }] });
  assert.throws(() => validateDirectReport(result, request()), /数字|数量/);
});

test('numeric rejection identifies the field and token without exposing the whole source', () => {
  assert.throws(() => validateDirectReport(report({ nextActions: [statement('私密地点花费999元')] }), request('不可泄露原文')), (error) => {
    assert.equal(error.code, 'unsupported_numeric_claim');
    assert.equal(error.field, 'nextActions[0].text');
    assert.equal(error.token, '999元');
    assert.match(error.message, /下一步第1项.*999元/);
    assert.doesNotMatch(error.message, /私密地点|不可泄露原文/);
    return true;
  });
});
