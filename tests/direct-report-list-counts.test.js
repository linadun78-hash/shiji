const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateDirectReport, buildSourceLists } = require('../src/direct-report-validator');
const { createDirectAiClient } = require('../src/direct-ai-client');
const captured = require('./fixtures/list-count-colon.json');
const latest = require('./fixtures/list-count-parentheses.json');
const marker = '{{sourceList:L1}}';
const sentence = '原文编号清单共3项：甲公园、乙公园、丙公园。';
function sample() {
  const request = { sourceRevision: 'rev', goal: '整理景点', constraints: [], supplementMode: 'source_only',
    selectedMaterials: [{ materialId: 'm1', evidence: [{ id: 'E1', quote: '1️⃣甲公园 交通信息。' },
      { id: 'E2', quote: '2️⃣乙公园 交通信息。3️⃣丙公园 交通信息。' }] }] };
  const statement = () => ({ text: marker, origin: 'source', citationIds: ['C1', 'C2'] });
  const report = { reportId: 'r', sourceRevision: 'rev', confidence: 'medium', modelVersion: 'test',
    goalUnderstanding: '整理景点', executiveSummary: marker, themes: [statement()], conflicts: [],
    informationGaps: ['未提供景点之间的距离。'], nextActions: [statement()], preflightActions: [], supplements: [],
    citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['E1'] }, { id: 'C2', materialId: 'm1', evidenceIds: ['E2'] }] };
  return { request, report };
}
// Synthetic protocol responses, deliberately separate from untouched raw fixtures.
function protocolReport(raw) {
  const report = structuredClone(raw);
  report.executiveSummary = `${marker}\n${report.executiveSummary.replace(/9个/g, '这些')}`;
  report.themes[0].text = `${marker}\n${report.themes[0].text.replace(/9个/g, '这些')}`;
  report.nextActions[0].text = `${marker}\n${report.nextActions[0].text.replace(/9个/g, '这些')}`;
  report.informationGaps = report.informationGaps.map((text) => text.replace(/9个/g, '这些'));
  return report;
}
function reject(report, request, code, field) {
  assert.throws(() => validateDirectReport(report, request), (error) => {
    assert.equal(error.code, code);
    if (field) assert.equal(error.field, field);
    return true;
  });
}
test('catalog uses only source evidence, exact members and coverage', () => {
  const { request } = sample();
  request.sourceLists = [{ id: 'L1', count: 999 }];
  request.selectedMaterials[0].summary = '共有999个景点';
  assert.deepEqual(buildSourceLists(request), [{ id: 'L1', materialId: 'm1', count: 3,
    members: ['甲公园', '乙公园', '丙公园'], evidenceIds: ['E1', 'E2'] }]);
  const real = buildSourceLists(captured.request)[0];
  assert.equal(real.count, 9);
  assert.deepEqual(real.members, ['青松公园', '中央广场', '河畔步道', '旧城门', '山景平台', '创意园', '湖心市集', '滨水公园', '观景台']);
  assert.deepEqual(real.evidenceIds, ['E1', 'E2']);
});
test('raw captured reports require correction, not silent acceptance', () => {
  for (const { report } of [captured, latest]) {
    assert.equal(report.sourceRevision, captured.request.sourceRevision);
    reject(report, captured.request, 'unsupported_numeric_claim', 'executiveSummary');
  }
});
test('expansion is program-owned and never mutates inputs', () => {
  const { request, report } = sample();
  const before = JSON.stringify({ request, report });
  const result = validateDirectReport(report, request);
  assert.equal(result.executiveSummary, sentence);
  assert.equal(result.themes[0].text, sentence);
  assert.equal(result.nextActions[0].text, sentence);
  assert.deepEqual(result.citations, report.citations);
  assert.equal(JSON.stringify({ request, report }), before);
  assert.notEqual(result, report);
});
test('standalone tokens support surrounding sentences and newlines', () => {
  for (const text of [marker, `参考清单。${marker}。核对交通。`, `参考清单\n${marker}\n核对交通。`]) {
    const { request, report } = sample();
    report.executiveSummary = text;
    const result = validateDirectReport(report, request);
    assert.ok(result.executiveSummary.includes(sentence));
    assert.doesNotMatch(result.executiveSummary, /\{\{|。。/);
  }
});
test('every supported text field expands using its own citation scope', () => {
  const { request, report } = sample();
  report.informationGaps = [marker];
  report.conflicts = [structuredClone(report.themes[0])];
  report.preflightActions = [{ title: marker, purpose: marker, steps: [marker], successCheck: marker,
    fallback: marker, origin: 'source', citationIds: ['C1', 'C2'] }];
  const result = validateDirectReport(report, request);
  assert.equal(result.informationGaps[0], sentence);
  assert.equal(result.conflicts[0].text, sentence);
  for (const key of ['title', 'purpose', 'successCheck', 'fallback']) assert.equal(result.preflightActions[0][key], sentence);
  assert.equal(result.preflightActions[0].steps[0], sentence);
});
test('unknown, malformed and embedded tokens fail closed', () => {
  for (const text of ['{{sourceList:L999}}', '{{sourceList:9}}', '{{sourceList:L1}', '{{other:L1}}',
    `门票${marker}元`, `${marker}个房间`, `参考 ${marker}`, `（${marker}）`]) {
    const { request, report } = sample(); report.executiveSummary = text;
    reject(report, request, 'invalid_source_list_token', 'executiveSummary');
  }
});
test('returned catalogs and tokens in metadata are rejected', () => {
  const { request, report } = sample();
  report.sourceLists = [{ id: 'L1', count: 999 }];
  assert.throws(() => validateDirectReport(report, request));
  delete report.sourceLists; report.themes[0].verificationNote = marker;
  reject(report, request, 'invalid_source_list_origin');
});
test('source tokens cannot become user requirements or supplements', () => {
  for (const where of ['goal', 'user', 'supplement']) {
    const { request, report } = sample();
    if (where === 'goal') report.goalUnderstanding = marker;
    if (where === 'user') { request.goal = marker; report.themes[0] = { text: marker, origin: 'user', citationIds: [] }; }
    if (where === 'supplement') { request.supplementMode = 'labeled_supplement'; report.supplements = [{ text: marker, origin: 'ai_supplement' }]; }
    reject(report, request, 'invalid_source_list_origin');
  }
});
test('summary, statement and preflight need complete material-specific citations', () => {
  for (const where of ['summary', 'themes', 'preflight', 'other']) {
    const { request, report } = sample();
    if (where === 'summary') { report.citations.pop(); report.themes = []; report.nextActions = []; }
    if (where === 'themes') report.themes[0].citationIds = ['C1'];
    if (where === 'preflight') report.preflightActions = [{ title: marker, origin: 'source', citationIds: ['C1'] }];
    if (where === 'other') {
      request.selectedMaterials.push({ materialId: 'm2', evidence: [{ id: 'E1', quote: '另一地点' }] });
      report.citations.push({ id: 'C3', materialId: 'm2', evidenceIds: ['E1'] });
      report.themes[0].citationIds = ['C3'];
    }
    reject(report, request, 'invalid_source_list_citation');
  }
});
test('heading chunk boundaries retain exact members and coverage', () => {
  const { request } = sample();
  request.selectedMaterials[0].evidence = [{ id: 'E1', quote: '1️⃣甲公园 信息。2️⃣乙' },
    { id: 'E2', quote: '公园 信息。3️⃣丙公园 信息。' }];
  assert.deepEqual(buildSourceLists(request)[0].members, ['甲公园', '乙公园', '丙公园']);
  assert.deepEqual(buildSourceLists(request)[0].evidenceIds, ['E1', 'E2']);
  const second = request.selectedMaterials[0].evidence.pop();
  request.selectedMaterials.push({ materialId: 'm2', evidence: [second] });
  assert.equal(buildSourceLists(request).some((list) => list.count === 3), false);
});
test('invalid sequences and ambiguous names are not list proofs', () => {
  for (const quote of ['1️⃣甲公园 信息。3️⃣乙公园 信息。4️⃣丙公园 信息。',
    '1️⃣甲公园 信息。2️⃣乙公园 信息。2️⃣丙公园 信息。', '1️⃣甲公园 信息。3️⃣丙公园 信息。2️⃣乙公园 信息。',
    '11️⃣甲公园 信息。12️⃣乙公园 信息。13️⃣丙公园 信息。', '1️⃣甲公园 信息。2️⃣甲公园 信息。',
    '1️⃣ 🚇 信息。2️⃣乙公园 信息。', '甲公园、乙公园、丙公园']) {
    const { request } = sample(); request.selectedMaterials[0].evidence = [{ id: 'E1', quote }];
    assert.deepEqual(buildSourceLists(request), []);
  }
});
test('computed lists never whitelist unrelated literal counts or quantities', () => {
  for (const claim of ['3个景点', '4项', '3个房间', '3个景点售票窗口', '3️⃣个房间', '3元', '3小时', '3公里', '3天', '300元']) {
    const { request, report } = sample(); report.themes[0].text = `${marker}\n${claim}。`;
    reject(report, request, 'unsupported_numeric_claim', 'themes[0].text');
  }
});
test('source keycap boundaries never invent quantities from unit-like headings', () => {
  for (const quantity of ['1月', '2日', '3小时']) {
    const { request, report } = sample();
    request.selectedMaterials[0].evidence = [{ id: 'E1', quote: '1️⃣月湖公园 信息。' },
      { id: 'E2', quote: '2️⃣日光公园 信息。3️⃣小时公园 信息。' }];
    report.themes[0].text = `游玩耗时${quantity}。`;
    reject(report, request, 'unsupported_numeric_claim', 'themes[0].text');
  }
});
test('normal protocol output uses one call with recomputed catalog', async () => {
  const { request, report } = sample(); request.sourceLists = [{ id: 'L1', count: 999 }];
  let calls = 0;
  const client = createDirectAiClient({ complete: async ({ messages }) => {
    calls += 1; const payload = JSON.parse(messages[1].content);
    assert.equal(payload.sourceLists[0].count, 3);
    assert.deepEqual(payload.selectedMaterials, request.selectedMaterials);
    assert.match(messages[0].content, /\{\{sourceList:L1\}\}/);
    assert.doesNotMatch(messages[0].content, /N个类别/);
    return { content: JSON.stringify(report) };
  } });
  assert.equal((await client.generateReport(request, {})).executiveSummary, sentence);
  assert.equal(calls, 1);
});
test('both real failures recover once through synthetic protocol responses', async () => {
  for (const fixture of [captured, latest]) {
    let calls = 0;
    const client = createDirectAiClient({ complete: async ({ messages }) => {
      calls += 1; const payload = JSON.parse(messages[1].content);
      assert.deepEqual(payload.selectedMaterials, captured.request.selectedMaterials);
      if (calls === 2) assert.equal(payload.correction.field, 'executiveSummary');
      return { content: JSON.stringify(calls === 1 ? fixture.report : protocolReport(fixture.report)) };
    } });
    const result = await client.generateReport(captured.request, {});
    assert.match(result.executiveSummary, /^原文编号清单共9项：青松公园、/);
    assert.equal(calls, 2); assert.doesNotMatch(JSON.stringify(result), /\{\{sourceList/);
  }
});
test('two invalid responses stop at two calls', async () => {
  let calls = 0;
  const client = createDirectAiClient({ complete: async () => { calls += 1; return { content: JSON.stringify(latest.report) }; } });
  await assert.rejects(client.generateReport(captured.request, {}), { code: 'unsupported_numeric_claim' });
  assert.equal(calls, 2);
});
test('invalid token format can be corrected once', async () => {
  const { request, report } = sample(); let calls = 0;
  const client = createDirectAiClient({ complete: async () => {
    calls += 1; return { content: JSON.stringify({ ...report, executiveSummary: calls === 1 ? '{{sourceList:L99}}' : marker }) };
  } });
  assert.equal((await client.generateReport(request, {})).executiveSummary, sentence);
  assert.equal(calls, 2);
});
test('later non-list errors prevent retry even when summary has a recoverable count', async () => {
  for (const mutate of [(r) => { r.themes[0].text = '花费999元。'; }, (r) => { r.themes[0].citationIds = ['missing']; },
    (r) => { r.themes[0].citationIds = ['C1']; }, (r) => { r.sourceRevision = 'stale'; },
    (r) => { delete r.nextActions; }, (r) => { r.themes = null; }, (r) => { r.preflightActions = null; },
    (r) => { r.informationGaps = null; }, (r) => { r.goalUnderstanding = null; },
    (r) => { r.confidence = {}; }, (r) => { delete r.themes[0].text; },
    (r) => { r.nextActions = [false]; }, (r) => { r.preflightActions = [false]; }]) {
    const { request, report } = sample(); report.executiveSummary = '3个景点。'; mutate(report); let calls = 0;
    const client = createDirectAiClient({ complete: async () => { calls += 1; return { content: JSON.stringify(report) }; } });
    await assert.rejects(client.generateReport(request, {})); assert.equal(calls, 1);
  }
});
test('provider, JSON and unverified count failures do not retry', async () => {
  for (const mode of ['network', 'json', 'no-list']) {
    const { request, report } = sample(); let calls = 0;
    request.selectedMaterials[0].evidence = [{ id: 'E1', quote: '甲公园。' }, { id: 'E2', quote: '乙公园。' }];
    report.executiveSummary = '3个景点。'; report.themes = []; report.nextActions = [];
    const client = createDirectAiClient({ complete: async () => {
      calls += 1;
      if (mode === 'network') throw Object.assign(new Error('offline'), { code: 'provider_network_error' });
      return { content: mode === 'json' ? 'not JSON' : JSON.stringify(report) };
    } });
    await assert.rejects(client.generateReport(request, {})); assert.equal(calls, 1);
  }
});
test('corrective output is fully revalidated', async () => {
  const { request, report } = sample(); let calls = 0;
  const client = createDirectAiClient({ complete: async () => {
    calls += 1; return { content: JSON.stringify({ ...report, executiveSummary: calls === 1 ? '3个景点。' : `${marker}\n门票999元。` }) };
  } });
  await assert.rejects(client.generateReport(request, {}), { code: 'unsupported_numeric_claim' }); assert.equal(calls, 2);
});
test('malformed markers cannot hide invented quantities or relative-time claims from retry policy', async () => {
  for (const text of ['{{sourceList:L1 门票999元。', '{{sourceList:L1 今天开放。',
    '{{sourceList:L1 门票999元。}}', '{{sourceList: L1}}\n花费999元。']) {
    const { request, report } = sample(); report.executiveSummary = text; let calls = 0;
    const client = createDirectAiClient({ complete: async () => { calls += 1; return { content: JSON.stringify(report) }; } });
    await assert.rejects(client.generateReport(request, {}));
    assert.equal(calls, 1, text);
  }
});
test('unmatched counts and classifier-prefixed durations do not trigger list correction', async () => {
  for (const text of ['酒店有99个房间。', '游玩需要99个小时。', '游玩需要3个小时。', '等待3个月。', '等待3个星期。']) {
    const { request, report } = sample(); report.executiveSummary = text; let calls = 0;
    const client = createDirectAiClient({ complete: async () => { calls += 1; return { content: JSON.stringify(report) }; } });
    await assert.rejects(client.generateReport(request, {})); assert.equal(calls, 1, text);
  }
});
test('preflight metadata schema errors also suppress corrective requests', async () => {
  for (const key of ['verificationStatus', 'verificationNote']) {
    const { request, report } = sample(); report.executiveSummary = '3个景点。';
    report.preflightActions = [{ title: '核对', purpose: '准备', steps: ['核对'], successCheck: '完成',
      fallback: '待确认', origin: 'source', citationIds: ['C1', 'C2'], [key]: { value: 'supported' } }];
    let calls = 0;
    const client = createDirectAiClient({ complete: async () => { calls += 1; return { content: JSON.stringify(report) }; } });
    await assert.rejects(client.generateReport(request, {}), { code: 'invalid_backend_response' });
    assert.equal(calls, 1);
  }
});
test('shipped bundle expands protocol output and limits correction to one call', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/background-bundle.js'), 'utf8');
  const context = vm.createContext({}); vm.runInContext(source.split('// bundled entry: background.js')[0], context);
  let calls = 0;
  const client = context.XhsDirectAiClient.createDirectAiClient({ complete: async () => {
    calls += 1; return { content: JSON.stringify(calls === 1 ? latest.report : protocolReport(latest.report)) };
  } });
  assert.match((await client.generateReport(captured.request, {})).executiveSummary, /^原文编号清单共9项：/);
  assert.equal(calls, 2);
});
