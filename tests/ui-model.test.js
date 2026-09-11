const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canManuallyRetryAnalysis,
  describeMissingFields,
  getAnalysisStatus,
  getCaptureAvailability,
  getClearConfirmation,
  getFamiliarityPresentation,
  getMaterialStatus,
  getReportPreset,
} = require('../src/ui-model.js');

test('exposes final report preset resolution for snapshot actions', () => {
  assert.equal(getReportPreset({ reportPreset: 'tutorial', goal: '随便' }), 'tutorial');
  assert.equal(getReportPreset({ reportPreset: 'travel', goal: '随便' }), 'travel');
  assert.equal(getReportPreset({ reportPreset: 'generic', goal: '随便' }), 'generic');
  assert.equal(getReportPreset({ reportPreset: 'unknown', goal: '安装应用教程' }), 'tutorial');
});

test('shows familiarity only for tutorial reports and explains automatic detection', () => {
  assert.deepEqual(getFamiliarityPresentation('tutorial'), {
    showOptions: true,
    tip: '熟悉程度只影响教程操作说明的详细程度，不改变素材事实。',
  });
  assert.deepEqual(getFamiliarityPresentation('auto'), {
    showOptions: false,
    tip: '自动识别为教程时，将按“零基础”说明。',
  });
  assert.deepEqual(getFamiliarityPresentation('travel'), { showOptions: false, tip: '' });
  assert.deepEqual(getFamiliarityPresentation('generic'), { showOptions: false, tip: '' });
});

test('allows a user-triggered retry for every failed analysis', () => {
  assert.equal(canManuallyRetryAnalysis({ analysisStatus: 'failed', analysisError: { retryable: false } }), true);
  assert.equal(canManuallyRetryAnalysis({ analysisStatus: 'failed', analysisError: { retryable: true } }), true);
  assert.equal(canManuallyRetryAnalysis({ analysisStatus: 'processing' }), false);
  assert.equal(canManuallyRetryAnalysis({ analysisStatus: 'insufficient' }), false);
  assert.equal(canManuallyRetryAnalysis({ analysisStatus: 'succeeded' }), true);
});

test('maps every analysis state to explicit text and tone', () => {
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'disabled' }), { label: '开启 AI 后整理', tone: 'neutral' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'pending' }), { label: '等待 AI 整理', tone: 'neutral' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'processing' }), { label: 'AI 整理中', tone: 'progress' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'succeeded' }), { label: '已整理', tone: 'success' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'insufficient' }), { label: '原文不足', tone: 'warning' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'failed' }), { label: '整理失败', tone: 'error' });
  assert.deepEqual(getAnalysisStatus({ analysisStatus: 'stale' }), { label: '等待重新整理', tone: 'warning' });
});

test('disables capture outside a ready note page', () => {
  const availability = getCaptureAvailability(
    { ready: false, reason: 'not-note-page' },
    [],
    'task-1',
  );

  assert.equal(availability.canCapture, false);
  assert.equal(availability.label, '打开图文笔记后可拾取');
  assert.equal(availability.state, 'not-note-page');
});

test('explains that video notes are outside the current scope', () => {
  const availability = getCaptureAvailability(
    { ready: false, reason: 'video-unsupported' },
    [],
    'task-1',
  );

  assert.equal(availability.canCapture, false);
  assert.equal(availability.label, '当前版本暂不支持视频');
  assert.equal(availability.state, 'video-unsupported');
});

test('offers to update a note already captured in the current task', () => {
  const result = {
    ready: true,
    capture: {
      sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new',
      missingFields: [],
    },
  };
  const materials = [{ taskId: 'task-1', pageSignature: 'xhs:abc123' }];

  const availability = getCaptureAvailability(result, materials, 'task-1');

  assert.equal(availability.canCapture, true);
  assert.equal(availability.label, '更新素材');
  assert.equal(availability.state, 'already-captured');
});

test('marks a readable but incomplete note before capture', () => {
  const result = {
    ready: true,
    capture: {
      sourceUrl: 'https://www.xiaohongshu.com/explore/partial123',
      missingFields: ['bodyText', 'coverUrl'],
    },
  };

  const availability = getCaptureAvailability(result, [], 'task-1');

  assert.equal(availability.canCapture, true);
  assert.equal(availability.label, '识别并拾取');
  assert.equal(availability.state, 'partial-ready');
});

test('describes stored material states without relying on color', () => {
  assert.equal(getMaterialStatus({ captureStatus: 'complete' }).label, '完整文本');
  assert.equal(
    getMaterialStatus({ captureStatus: 'partial', missingFields: ['author', 'bodyText', 'coverUrl'] }).label,
    '仅基础信息',
  );
  assert.equal(
    getMaterialStatus({ captureStatus: 'partial', missingFields: ['coverUrl'] }).label,
    '部分信息',
  );
});

test('translates missing field names into readable Chinese', () => {
  assert.equal(describeMissingFields(['author', 'bodyText', 'coverUrl']), '缺少作者、正文、封面');
  assert.equal(describeMissingFields([]), '字段完整');
});

test('requires clear confirmation to belong to the same current task', () => {
  assert.equal(getClearConfirmation('task-1', 5000, 'task-1', 3000), 'confirm');
  assert.equal(getClearConfirmation('task-1', 5000, 'task-2', 3000), 'arm');
  assert.equal(getClearConfirmation('task-1', 5000, 'task-1', 6000), 'arm');
});
