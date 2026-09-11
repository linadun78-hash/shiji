const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildWorkbookPages,
  canAdvanceReportStep,
  clampReportStep,
  inferWorkbookPreset,
} = require('../src/ui-model');

test('report workflow clamps steps to the three visible stages', () => {
  assert.equal(clampReportStep(0), 1);
  assert.equal(clampReportStep(2), 2);
  assert.equal(clampReportStep(8), 3);
});

test('report workflow requires two materials and a concrete goal before advancing', () => {
  assert.equal(canAdvanceReportStep(1, { selectedCount: 1, goal: '', hasReport: false }), false);
  assert.equal(canAdvanceReportStep(1, { selectedCount: 2, goal: '', hasReport: false }), true);
  assert.equal(canAdvanceReportStep(2, { selectedCount: 2, goal: '旅行', hasReport: false }), false);
  assert.equal(canAdvanceReportStep(2, { selectedCount: 2, goal: '规划广州旅行', hasReport: false }), true);
  assert.equal(canAdvanceReportStep(3, { selectedCount: 2, goal: '规划广州旅行', hasReport: false }), false);
  assert.equal(canAdvanceReportStep(3, { selectedCount: 2, goal: '规划广州旅行', hasReport: true }), true);
});

test('workbook pages deterministically map the report contract into five page types', () => {
  const report = {
    goalUnderstanding: '规划广州秋季校园招聘准备',
    executiveSummary: '先核对时间，再分阶段准备材料。',
    themes: [{ text: '网申准备', citationIds: ['C1'] }],
    nextActions: [{ text: '更新简历', citationIds: ['C1'] }],
    conflicts: [{ text: '两个日期存在冲突', citationIds: ['C2'] }],
    informationGaps: ['缺少截止日期'],
    citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['E1'] }],
  };
  const materials = [{ id: 'm1', title: '秋招时间表', coverUrl: 'cover.jpg' }];

  const pages = buildWorkbookPages(report, materials);

  assert.deepEqual(pages.map((page) => page.kind), [
    'cover', 'overview', 'timeline', 'risks', 'sources',
  ]);
  assert.equal(pages[0].materials[0].title, '秋招时间表');
  assert.equal(pages[2].items[0].text, '更新简历');
  assert.equal(pages[3].gaps[0], '缺少截止日期');
  assert.equal(pages[4].citations[0].id, 'C1');
});

test('travel goals select the travel workbook while unrelated goals stay generic', () => {
  assert.equal(inferWorkbookPreset('整理深圳两天旅行路线'), 'travel');
  assert.equal(inferWorkbookPreset('Prepare a travel itinerary'), 'travel');
  assert.equal(inferWorkbookPreset('根据这些广州攻略，整理一份两天一夜、少排队的路线'), 'travel');
  assert.equal(inferWorkbookPreset('整理深圳周末美食攻略'), 'travel');
  assert.equal(inferWorkbookPreset('整理求职面试资料'), 'generic');
  assert.equal(inferWorkbookPreset('规划职业路线'), 'generic');
  assert.equal(inferWorkbookPreset('整理求职攻略'), 'generic');
  assert.equal(inferWorkbookPreset('Fix router behavior'), 'generic');
  assert.equal(inferWorkbookPreset('评估旅行行业求职机会'), 'generic');
  assert.equal(inferWorkbookPreset('整理旅行社招聘信息'), 'generic');
  assert.equal(inferWorkbookPreset('travel industry research'), 'generic');
});

test('travel workbook maps existing report facts into five truthful page types', () => {
  const report = {
    reportPreset: 'travel',
    goal: '规划深圳两天旅行',
    constraints: ['预算不超过 3000 元', '家庭出行'],
    goalUnderstanding: '规划深圳两天旅行，优先艺术与美食。',
    executiveSummary: '先安排顺路地点，再核实营业时间。',
    themes: [
      { text: 'OCT-LOFT 适合上午参观', citationIds: ['C1'] },
      { text: '预计餐饮费用 800 元', citationIds: ['C2'] },
      { text: 'RMB 800 可覆盖门票', citationIds: ['C5'] },
      { text: '预算约 900 元', citationIds: [] },
    ],
    nextActions: [
      { text: '上午前往 OCT-LOFT', citationIds: ['C1'] },
      { text: '晚上到海上世界用餐', citationIds: ['C3'] },
    ],
    conflicts: [{ text: '营业时间存在两个版本', citationIds: ['C3', 'C4'] }],
    informationGaps: ['酒店地址尚未确认'],
    citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['E1'] }],
  };
  const materials = [{ id: 'm1', title: '深圳周末路线', coverUrl: 'cover.jpg' }];

  const pages = buildWorkbookPages(report, materials);

  assert.deepEqual(pages.map((page) => page.kind), [
    'travel-cover',
    'travel-itinerary',
    'travel-rationale',
    'travel-preparation',
    'travel-verify',
  ]);
  assert.equal(pages[0].constraints[0], '预算不超过 3000 元');
  assert.equal(pages[1].items[1].citationIds[0], 'C3');
  assert.equal(pages[2].items[0].citationIds[0], 'C1');
  assert.deepEqual(pages[3].budgetItems, [
    { text: '预计餐饮费用 800 元', citationIds: ['C2'] },
    { text: 'RMB 800 可覆盖门票', citationIds: ['C5'] },
  ]);
  assert.deepEqual(pages[3].checklist, ['酒店地址尚未确认']);
  assert.equal(pages[4].conflicts[0].citationIds[1], 'C4');
  assert.equal(pages[4].citations[0].id, 'C1');
});

test('explicit generic preset preserves the existing workbook even when copy mentions travel', () => {
  const pages = buildWorkbookPages({
    reportPreset: 'generic',
    goalUnderstanding: '评估旅行行业求职机会',
    executiveSummary: '整理岗位信息。',
    themes: [], nextActions: [], conflicts: [], informationGaps: [], citations: [],
  }, []);

  assert.deepEqual(pages.map((page) => page.kind), [
    'cover', 'overview', 'timeline', 'risks', 'sources',
  ]);
});

test('tutorial workbook starts with sourced operations and keeps five pages', () => {
  const report = {
    reportPreset: 'tutorial',
    goalUnderstanding: '安装并运行应用',
    executiveSummary: '按照素材先安装，再检查版本。',
    preflightActions: [{
      title: '确认安装包', purpose: '避免使用错误版本。', steps: ['下载安装包'],
      successCheck: '安装器可以打开。', fallback: '返回来源核对版本。', citationIds: ['C1'],
    }],
    themes: [{ text: '先确认环境', citationIds: ['C1'] }],
    nextActions: [{ text: '完成安装', citationIds: ['C1'] }],
    conflicts: [], informationGaps: ['缺少系统版本'],
    supplements: [{
      text: '查看官方安装说明。', verificationNote: '按当前版本核实。',
      origin: 'ai_supplement', verificationStatus: 'needs_verification', citationIds: [],
    }],
    citations: [{ id: 'C1', materialId: 'm1', evidenceIds: ['E1'] }],
  };

  const pages = buildWorkbookPages(report, []);

  assert.deepEqual(pages.map((page) => page.kind), [
    'tutorial-start', 'tutorial-overview', 'tutorial-steps', 'tutorial-verify', 'tutorial-sources',
  ]);
  assert.equal(pages[0].items[0].title, '确认安装包');
  assert.equal(pages[3].supplements[0].origin, 'ai_supplement');
  assert.equal(pages.length, 5);
});

test('labeled supplements remain in travel and generic workbook pages', () => {
  const supplement = {
    text: '核实当前开放时间。',
    verificationNote: '执行前查看官方页面。',
    origin: 'ai_supplement',
    verificationStatus: 'needs_verification',
    citationIds: [],
  };
  const travelPages = buildWorkbookPages({
    reportPreset: 'travel', supplements: [supplement], themes: [], nextActions: [],
    conflicts: [], informationGaps: [], citations: [], constraints: [],
    goalUnderstanding: '旅行', executiveSummary: '整理路线。',
  }, []);
  const genericPages = buildWorkbookPages({
    reportPreset: 'generic', supplements: [supplement], themes: [], nextActions: [],
    conflicts: [], informationGaps: [], citations: [],
    goalUnderstanding: '整理资料', executiveSummary: '整理结果。',
  }, []);

  assert.equal(travelPages[4].supplements[0].origin, 'ai_supplement');
  assert.equal(genericPages[3].supplements[0].origin, 'ai_supplement');
});
