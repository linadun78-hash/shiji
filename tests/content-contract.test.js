const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'content.css'), 'utf8');
const workbookExport = fs.readFileSync(path.join(__dirname, '..', 'src', 'workbook-export.js'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');

test('includes one-time AI consent and raw evidence disclosure', () => {
  assert.match(content, /xmc-ai-consent/);
  assert.match(content, /开启 AI 自动整理/);
  assert.match(content, /查看原始摘录/);
  assert.match(content, /XMC_ENABLE_AI/);
  assert.match(content, /XMC_ANALYZE_MATERIAL/);
  assert.match(content, /XMC_RETRY_ALL_ANALYSIS/);
  assert.match(content, /xhsAnalysisState|ANALYSIS_STATE_KEY/);
  assert.match(css, /\.xmc-brief/);
  assert.match(css, /\.xmc-analysis-skeleton/);
});

test('failed material cards display the provider diagnostic id', () => {
  assert.match(content, /analysisError\?\.diagnosticId/);
  assert.match(content, /诊断编号：/);
  assert.match(content, /canManuallyRetryAnalysis\(material\)/);
  assert.match(content, /重新整理/);
});

test('AI consent accurately discloses the request allowlist and exclusions', () => {
  assert.match(content, /标题、公开作者昵称、正文、安全来源地址、拾取时间和内容哈希会发送/);
  assert.match(content, /不会发送当前登录账号、Cookie、回看地址或图片/);
});

test('Stitch drawer exposes material, report, settings, and folding controls', () => {
  assert.match(content, /xmc-view-tab/);
  assert.match(content, /xmc-materials-view/);
  assert.match(content, /xmc-report-view/);
  assert.match(content, /xmc-settings-view/);
  assert.match(content, /xmc-settings-toggle/);
  assert.match(content, /xmc-expand-all/);
  assert.match(content, /xmc-collapse-all/);
  assert.match(content, /xmc-material__toggle/);
  assert.match(content, /xmc-run-ai-all/);
  assert.match(content, /XMC_GET_SETTINGS/);
  assert.match(content, /XMC_TEST_SETTINGS/);
  assert.match(content, /XMC_SAVE_SETTINGS/);
  assert.match(content, /XMC_GENERATE_REPORT/);
  assert.match(css, /3px 3px 0/);
});

test('exposes a local tutorial manual view and snapshot actions', () => {
  assert.match(content, /data-view="manuals"/);
  assert.match(content, /xmc-manuals-view/);
  assert.match(content, /xmc-manual-list/);
  assert.match(content, /XhsTutorialManualRepository/);
  assert.match(content, /manualRepository/);
  assert.match(content, /打开手册/);
  assert.match(content, /删除手册/);
  assert.match(content, /xmc-manual-detail/);
  assert.match(content, /manualResult: root\.querySelector/);
  assert.match(content, /renderReportResult\(activeManual\.report, elements\.manualResult\)/);
  assert.match(content, /xmc-manual-delete/);
  assert.match(content, /activeManual = manual;\s*workbookPageIndex = 0;\s*setActiveView\('manuals'\)/);
  assert.match(content, /xmc-manual-back/);
  assert.match(content, /const resultRoot = activeManual \? elements\.manualResult : elements\.reportResult/);
  assert.match(css, /\.xmc-manual-card/);
  assert.match(css, /\.xmc-manual-delete/);
});

test('Stitch corrections expose provider presets and the pixel book brand', () => {
  assert.match(content, /xmc-settings-provider/);
  assert.match(content, /XhsProviderPresets/);
  assert.match(content, /xmc-brand-logo/);
  assert.match(content, /assets\/shiji-mark\.svg/);
});

test('report view owns a height-constrained scroll track', () => {
  assert.match(css, /\.xmc-report-view\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.match(css, /\.xmc-report-view\s*>\s*\.xmc-scroll-area\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*scroll;/s);
});

test('report generation binds completion to the task that started the request', () => {
  assert.match(content, /const reportTaskId = repository\.getState\(\)\.currentTaskId/);
  assert.match(content, /saveReport\(reportTaskId/);
});

test('saves any successful report only after an explicit user action', () => {
  assert.match(content, /xmc-workbook-save-manual/);
  assert.match(content, /保存到手册/);
  assert.match(content, /async function saveTutorialManual/);
  assert.match(content, /manualRepository\.save/);
  assert.match(content, /selectedMaterialIds: selected\.map/);
  assert.match(content, /materials: selected\.map/);
  assert.match(content, /const saved = await saveTutorialManual\(/);
  assert.equal((content.match(/await saveTutorialManual\(/g) || []).length, 1);
  assert.doesNotMatch(content, /getReportPreset\(displayedRecord\) === 'tutorial'/);
  assert.match(content, /else if \(!activeManual && displayedRecord\.status !== 'failed'\)/);
  assert.match(content, /xmc-workbook-action-bar/);
  assert.match(css, /\.xmc-workbook-save-manual/);
});

test('opens stored report snapshots without reading current task materials', () => {
  assert.match(content, /function openTutorialManual\(manual\)/);
  assert.match(content, /activeManual\?\.report/);
  assert.match(content, /Array\.isArray\(activeManual\.materials\)/);
  assert.match(content, /buildWorkbookPages\(displayedRecord, materials\)/);
  assert.match(content, /当前手册为保存时快照/);
});

test('isolates local manual deletion errors from the current report', () => {
  assert.match(content, /async function removeTutorialManual\(id\)/);
  assert.match(content, /手册删除失败，请重试/);
  assert.match(content, /window\.confirm/);
});

test('saved API key can be reused without making the hidden field required', () => {
  assert.doesNotMatch(content, /xmc-settings-api-key[^>]+required/);
});

test('settings switches to a sanitized cloud account panel when Auth0 is enabled', () => {
  assert.match(content, /xmc-cloud-account/);
  assert.match(content, /xmc-account-name/);
  assert.match(content, /xmc-account-email/);
  assert.match(content, /云端 AI 服务/);
  assert.match(content, /上线后显示/);
  assert.match(content, /XMC_GET_AUTH_STATUS/);
  assert.match(content, /XMC_AUTH_SIGN_IN/);
  assert.match(content, /XMC_AUTH_SIGN_OUT/);
  assert.doesNotMatch(content, /accessToken|refreshToken/);
  assert.match(css, /\.xmc-cloud-account/);
  assert.match(css, /\.xmc-account-card/);
});

test('settings exposes direct BYOA mode and keeps local mode advanced', () => {
  assert.match(content, /XMC_GET_PROVIDER_SETTINGS/);
  assert.match(content, /XMC_TEST_PROVIDER_SETTINGS/);
  assert.match(content, /XMC_SAVE_PROVIDER_SETTINGS/);
  assert.match(content, /高级设置/);
  assert.match(content, /首次配置/);
  assert.match(content, /自定义地址可能需要浏览器主机权限/);
  assert.match(content, /XMC_MARK_PROVIDER_TESTED/);
  assert.match(manifest, /optional_host_permissions/);
  assert.match(content, /首次使用需要先完成模型配置并测试连接/);
});

test('report uses a visible three-step material to workbook workflow', () => {
  assert.match(content, /xmc-report-progress/);
  assert.match(content, /data-report-step="1"[^>]*>[^<]*<[^>]+>1<\/span>[^<]*选素材/s);
  assert.match(content, /data-report-step="2"[^>]*>[^<]*<[^>]+>2<\/span>[^<]*定目标/s);
  assert.match(content, /data-report-step="3"[^>]*>[^<]*<[^>]+>3<\/span>[^<]*看手册/s);
  assert.match(content, /data-report-panel="1"/);
  assert.match(content, /data-report-panel="2"/);
  assert.match(content, /data-report-panel="3"/);
});

test('report goal step exposes prompt controls and supplement risk copy', () => {
  assert.match(content, /xmc-report-preset/);
  assert.match(content, /自动识别/);
  assert.match(content, /xmc-familiarity-level/);
  assert.match(content, /xmc-familiarity-tip/);
  assert.match(content, /getFamiliarityPresentation/);
  assert.match(content, /熟悉程度只影响教程操作说明的详细程度/);
  assert.match(content, /零基础/);
  assert.match(content, /有一点了解/);
  assert.match(content, /xmc-report-supplement/);
  assert.match(content, /允许 AI 补充素材未提及的内容/);
  assert.match(content, /AI 补充内容可能不准确或已经过时/);
  assert.match(content, /labeled_supplement/);
  assert.match(content, /source_only/);
  assert.match(css, /\.xmc-report-options/);
  assert.match(css, /\.xmc-familiarity-options/);
  assert.match(css, /\.xmc-familiarity-section/);
  assert.match(css, /\.xmc-supplement-warning/);
  assert.doesNotMatch(css, /var\(--xmc-focus\)/);
});

test('report result renders preflight actions and labeled supplements', () => {
  assert.match(content, /appendTutorialActions\(sheet, page\.items\)/);
  assert.match(content, /AI 补充・待核实/);
  assert.match(content, /verificationNote/);
  assert.match(content, /appendSupplements\(sheet, page\.supplements\)/);
  assert.match(content, /verificationStatus/);
  assert.match(content, /用户要求/);
  assert.match(css, /\.xmc-workbook-supplements/);
});

test('report material selection exposes explicit add and selected buttons', () => {
  assert.match(content, /xmc-report-material-toggle/);
  assert.match(content, /aria-pressed/);
  assert.match(content, /已选/);
  assert.match(content, /加入/);
});

test('generated report renders a five-page visual workbook', () => {
  assert.match(content, /xmc-workbook/);
  assert.match(content, /xmc-workbook-cover/);
  assert.match(content, /xmc-workbook-timeline/);
  assert.match(content, /xmc-workbook-risks/);
  assert.match(content, /xmc-workbook-sources/);
  assert.match(content, /xmc-workbook-prev/);
  assert.match(content, /xmc-workbook-next/);
  assert.match(content, /xmc-workbook-export-menu/);
  assert.match(content, /xmc-workbook-export-options/);
  assert.match(content, /导出 PDF/);
  assert.match(content, /导出 PNG/);
  assert.match(content, /导出 JPG/);
  assert.match(content, /正在导出/);
  assert.match(content, /xmc-workbook-print/);
  assert.match(workbookExport, /afterprint/);
  assert.match(workbookExport, /\.print\(\)/);
  assert.match(css, /data-report-panel="1"/);
  assert.match(css, /data-report-panel="2"/);
  assert.match(css, /data-report-panel="3"/);
  assert.match(css, /@media print/);
  assert.match(css, /\.xmc-workbook-print/);
  assert.match(css, /transform:\s*scale\(var\(--xmc-print-scale/);
  assert.doesNotMatch(css, /xmc-workbook-export-trigger::after/);
  assert.match(css, /break-after:\s*page/);
});

test('generated workbook keeps the Stitch v6 tactile scrapbook anatomy', () => {
  assert.match(content, /xmc-workbook-binding/);
  assert.match(content, /xmc-workbook-washi/);
  assert.match(content, /xmc-workbook-index-tab/);
  assert.match(content, /xmc-workbook-route/);
  assert.match(content, /xmc-workbook-risk-stamp/);
  assert.match(content, /xmc-workbook-control-cluster/);
  assert.match(css, /--xmc-hard-shadow:\s*4px 4px 0/);
  assert.match(css, /\.xmc-workbook-binding/);
  assert.match(css, /\.xmc-workbook-washi/);
  assert.match(css, /\.xmc-workbook-index-tab/);
  assert.match(css, /\.xmc-workbook-route/);
  assert.match(css, /\.xmc-workbook-risk-stamp/);
  assert.match(css, /\.xmc-workbook-control-cluster/);
});

test('travel workbook renders five evidence-aware production pages', () => {
  assert.match(content, /xmc-travel-cover/);
  assert.match(content, /xmc-travel-itinerary/);
  assert.match(content, /xmc-travel-rationale/);
  assert.match(content, /xmc-travel-preparation/);
  assert.match(content, /xmc-travel-verify/);
  assert.match(content, /xmc-travel-stop-card/);
  assert.match(content, /xmc-travel-decision-card/);
  assert.match(content, /xmc-travel-budget/);
  assert.match(content, /xmc-travel-notice/);
  assert.match(content, /xmc-travel-sources/);
  assert.match(content, /素材依据/);
  assert.doesNotMatch(content, /把选择排成一天/);
  assert.match(content, /reportPreset,/);
  assert.match(content, /reportPresetSelection/);
  assert.match(content, /\.filter\(Boolean\)\s*\.slice\(0, 12\)/);
  assert.match(content, /let reportInputTaskId = null/);
  assert.match(content, /record\?\.constraints\?\.join\('\\n'\)/);
  assert.match(css, /\.xmc-travel-itinerary/);
  assert.match(css, /\.xmc-travel-decision-card/);
  assert.match(css, /\.xmc-travel-budget/);
  assert.match(css, /\.xmc-travel-sources/);
});

test('drawer and workbook remain keyboard and print accessible', () => {
  assert.match(content, /class="xmc-drawer"[^>]+inert/);
  assert.match(content, /elements\.drawer\.inert\s*=\s*!open/);
  assert.match(content, /function scrollReportToTop\(\)/);
  assert.match(content, /prefers-reduced-motion:\s*reduce/);
  assert.match(content, /focusWorkbookControl\('previous'(?:, resultRoot)?\)/);
  assert.match(content, /focusWorkbookControl\('next'(?:, resultRoot)?\)/);
  assert.match(css, /\.xmc-workbook-source:not\(\[open\]\)\s*>\s*:not\(summary\)[^{]*\{[^}]*display:\s*block\s*!important/s);
});

test('workbook geometry exposes its offset layer and connected route', () => {
  assert.match(css, /\.xmc-workbook-page\s*\{[^}]*overflow:\s*visible;[^}]*isolation:\s*isolate;/s);
  assert.match(css, /\.xmc-workbook-timeline-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(css, /\.xmc-workbook-route::before\s*\{[^}]*content:\s*none/);
  assert.match(css, /\.xmc-icon-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  assert.match(css, /\.xmc-material__toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
});

test('report step changes reset the report scroll area to the top', () => {
  assert.match(content, /reportScrollArea:\s*root\.querySelector\('\.xmc-report-view > \.xmc-scroll-area'\)/);
  assert.match(content, /elements\.reportScrollArea\.scrollTo\(\{\s*top:\s*0/s);
});

test('report pagination resets only its own scroll area', () => {
  const resets = content.match(/renderReportResult\(record, resultRoot\);\s*focusWorkbookControl\('[^']+', resultRoot\);\s*if \(!activeManual\) scrollReportToTop\(\);/g) || [];
  assert.equal(resets.length, 2);
});

test('manual pagination leaves the user scroll position untouched', () => {
  assert.equal((content.match(/if \(!activeManual\) scrollReportToTop\(\);/g) || []).length, 2);
  assert.match(content, /focusWorkbookControl\('previous', resultRoot\)/);
  assert.match(content, /focusWorkbookControl\('next', resultRoot\)/);
});

test('content exposes PDF and browser-local PNG/JPG workbook export formats', () => {
  assert.match(content, /renderer:\s*'html2canvas'/);
  assert.match(content, /'summary', 'xmc-workbook-export-trigger', '导出'/);
  assert.match(content, /ENABLE_WORKBOOK_IMAGE_EXPORT\s*=\s*true/);
  assert.match(content, /选择图片页/);
  assert.match(content, /PNG/);
  assert.match(content, /JPG/);
  assert.match(content, /exportWorkbookImages/);
  assert.match(content, /syncImageExportSubmit\(false\)/);
  assert.match(content, /function syncImageExportSubmit\(updateStatus = true\)/);
  assert.doesNotMatch(content, /实验 PNG/);
  assert.doesNotMatch(content, /exportWorkbookPngPrototype/);
  assert.doesNotMatch(content, /XhsWorkbookImagePrototype/);
});
