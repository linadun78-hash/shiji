(function startCollector() {
  const ROOT_ID = 'xhs-task-material-collector-root';
  const ENABLE_WORKBOOK_IMAGE_EXPORT = true;
  const WORKBOOK_IMAGE_CANVAS_MODE = 'adaptive';
  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement('section');
  root.id = ROOT_ID;
  root.setAttribute('aria-label', '拾集任务素材助手');
  const brandLogoUrl = chrome.runtime.getURL('assets/shiji-mark.svg');
  root.innerHTML = `
    <div class="xmc-capture-wrap">
      <button class="xmc-capture" type="button" disabled>
        <span class="xmc-capture__label">正在检查当前页面</span>
        <span class="xmc-capture__hint">不会自动保存</span>
      </button>
    </div>
    <button class="xmc-dock" type="button" aria-expanded="false" aria-controls="xmc-drawer">
      <span>素材箱</span><span class="xmc-count" aria-label="0 条素材">0</span>
    </button>
    <div class="xmc-toast" role="status" aria-live="polite" hidden>
      <span class="xmc-toast__thumb" aria-hidden="true"></span>
      <span class="xmc-toast__body">
        <strong class="xmc-toast__title">已添加到素材箱</strong>
        <span class="xmc-toast__detail"></span>
      </span>
    </div>
    <aside class="xmc-drawer" id="xmc-drawer" aria-hidden="true" inert>
      <header class="xmc-header">
        <img class="xmc-brand-logo" src="${brandLogoUrl}" alt="">
        <div class="xmc-header__copy">
          <p class="xmc-eyebrow">SHIJI COLLECTOR</p>
          <h2>拾集</h2>
        </div>
        <span class="xmc-connection" data-state="unknown">模型未检查</span>
        <button class="xmc-icon-button xmc-settings-toggle" type="button" aria-label="模型设置" title="模型设置">⚙</button>
        <button class="xmc-icon-button xmc-close" type="button" aria-label="关闭素材箱" title="关闭">×</button>
      </header>
      <nav class="xmc-view-tabs" aria-label="抽屉视图">
        <button class="xmc-view-tab" type="button" data-view="materials" aria-selected="true">素材</button>
        <button class="xmc-view-tab" type="button" data-view="report" aria-selected="false">报告</button>
        <button class="xmc-view-tab" type="button" data-view="manuals" aria-selected="false">手册</button>
      </nav>
      <section class="xmc-settings-view" hidden aria-labelledby="xmc-settings-title">
        <div class="xmc-section-heading">
          <div><span class="xmc-index">SET-01</span><h3 id="xmc-settings-title" class="xmc-settings-title">模型设置</h3></div>
          <button class="xmc-text-button xmc-settings-back" type="button">返回</button>
        </div>
        <form class="xmc-settings-form">
          <label class="xmc-field"><span>连接方式</span><select class="xmc-settings-mode" aria-label="选择连接方式"><option value="direct">直接连接模型（推荐）</option><option value="local">高级设置：本地服务</option></select><small>首次配置需要测试连接成功后才能开启 AI。</small></label>
          <label class="xmc-field xmc-provider-field"><span>模型厂商</span><select class="xmc-settings-provider" aria-label="选择模型厂商"></select><small>选择预设后仍可修改下方地址和模型。</small></label>
          <label class="xmc-field"><span>API 地址</span><input class="xmc-settings-base-url" type="url" required placeholder="https://api.example.com/v1"><small>自定义地址可能需要浏览器主机权限；如果测试失败，请检查中转站是否允许浏览器跨域请求。</small></label>
          <label class="xmc-field"><span>模型名称</span><input class="xmc-settings-model" required placeholder="model-name"></label>
          <label class="xmc-field"><span>API 密钥</span><span class="xmc-secret-field"><input class="xmc-settings-api-key" type="password" autocomplete="off"><button class="xmc-secret-toggle" type="button" aria-label="显示密钥">◉</button></span></label>
          <p class="xmc-settings-feedback" role="status" aria-live="polite">首次配置：填写模型服务并测试连接。</p>
          <div class="xmc-settings-actions"><button class="xmc-secondary-button xmc-test-settings" type="button">测试连接</button><button class="xmc-primary-button xmc-save-settings" type="submit">保存设置</button></div>
        </form>
        <section class="xmc-cloud-account" hidden aria-label="云端账号">
          <article class="xmc-account-card">
            <div class="xmc-account-avatar" aria-hidden="true">拾</div>
            <div class="xmc-account-identity">
              <strong class="xmc-account-name">尚未登录</strong>
              <span class="xmc-account-email">登录后同步云端服务状态</span>
            </div>
            <span class="xmc-account-badge">云端</span>
          </article>
          <dl class="xmc-account-facts">
            <div><dt>云端 AI 服务</dt><dd class="xmc-cloud-ai-status">待登录</dd></div>
            <div><dt>本月用量</dt><dd>上线后显示</dd></div>
          </dl>
          <p class="xmc-account-feedback" role="status" aria-live="polite">登录后即可使用云端整理。</p>
          <button class="xmc-primary-button xmc-auth-sign-in" type="button">登录拾集账号</button>
          <button class="xmc-secondary-button xmc-auth-sign-out" type="button" hidden>退出登录</button>
        </section>
      </section>
      <section class="xmc-materials-view">
        <div class="xmc-scroll-area">
          <div class="xmc-taskbar">
            <label class="xmc-field"><span>素材归属</span><select class="xmc-task-select" aria-label="选择任务"></select></label>
            <button class="xmc-icon-button xmc-add-task" type="button" aria-label="新建任务" title="新建任务">＋</button>
          </div>
          <form class="xmc-new-task" hidden><label for="xmc-task-name">新任务名称</label><div><input id="xmc-task-name" maxlength="40" autocomplete="off" placeholder="例如：广州两日游"><button type="submit">创建</button></div></form>
          <p class="xmc-feedback" role="status" aria-live="polite">数据仅保存在当前浏览器。</p>
          <section class="xmc-ai-consent" aria-labelledby="xmc-ai-consent-title"><div><strong id="xmc-ai-consent-title">开启 AI 自动整理</strong><p>标题、公开作者昵称、正文、安全来源地址、拾取时间和内容哈希会发送到本机配置的模型服务；不会发送当前登录账号、Cookie、回看地址或图片。</p></div><button class="xmc-enable-ai" type="button">开启</button></section>
          <button class="xmc-drawer-capture xmc-primary-button" type="button" disabled><span class="xmc-drawer-capture__label">正在检查当前页面</span><span class="xmc-drawer-capture__hint">不会自动保存</span></button>
          <div class="xmc-ai-actions" hidden><button class="xmc-run-ai-all xmc-secondary-button" type="button">AI 一键整理</button><span class="xmc-ai-actions__hint">当前任务已全部整理</span></div>
          <div class="xmc-list-toolbar"><span><b class="xmc-index">MAT-01</b> 已拾取素材</span><span><button class="xmc-text-button xmc-expand-all" type="button">全部展开</button><button class="xmc-text-button xmc-collapse-all" type="button">全部折叠</button></span></div>
          <div class="xmc-list" aria-label="已拾取素材"></div>
        </div>
        <footer class="xmc-footer"><span class="xmc-footer__count">0 条素材</span><button class="xmc-clear" type="button">清空当前任务</button></footer>
      </section>
      <section class="xmc-report-view" hidden>
        <div class="xmc-scroll-area">
          <nav class="xmc-report-progress" aria-label="报告生成步骤">
            <button class="xmc-report-step" type="button" data-report-step="1"><span>1</span>选素材</button>
            <button class="xmc-report-step" type="button" data-report-step="2"><span>2</span>定目标</button>
            <button class="xmc-report-step" type="button" data-report-step="3"><span>3</span>看手册</button>
          </nav>
          <section class="xmc-report-panel" data-report-panel="1">
            <div class="xmc-section-heading"><div><span class="xmc-index">STEP-01</span><h3>选择参与整理的素材</h3></div><span class="xmc-report-selected-count">已选择 0 条</span></div>
            <p class="xmc-report-intro">仅显示已完成 AI 整理的素材，至少选择两条。</p>
            <div class="xmc-report-material-list" aria-label="可参与报告的素材"></div>
            <button class="xmc-primary-button xmc-report-next" type="button">下一步：设置目标</button>
          </section>
          <section class="xmc-report-panel" data-report-panel="2" hidden>
            <div class="xmc-section-heading"><div><span class="xmc-index">STEP-02</span><h3>明确整理目标</h3></div><span class="xmc-report-status">尚未生成</span></div>
            <label class="xmc-field"><span>你希望用这些素材完成什么？</span><textarea class="xmc-report-goal" maxlength="2000" placeholder="例如：根据这些广州攻略，整理一份两天一夜、少排队的路线"></textarea></label>
            <section class="xmc-report-options" aria-label="报告生成设置">
              <label class="xmc-field"><span>报告类型</span><select class="xmc-report-preset"><option value="auto">自动识别</option><option value="tutorial">教程拆解</option><option value="travel">旅行计划</option><option value="generic">通用整理</option></select></label>
              <section class="xmc-familiarity-section">
                <fieldset class="xmc-familiarity-options" hidden><legend>熟悉程度</legend><label><input type="radio" name="xmc-familiarity-level" value="beginner" checked><span>零基础</span></label><label><input type="radio" name="xmc-familiarity-level" value="informed"><span>有一点了解</span></label></fieldset>
                <p class="xmc-familiarity-tip">自动识别为教程时，将按“零基础”说明。</p>
                <span class="xmc-familiarity-tutorial-copy" hidden>熟悉程度只影响教程操作说明的详细程度，不改变素材事实。</span>
              </section>
              <label class="xmc-report-supplement"><input type="checkbox"><span><strong>允许 AI 补充素材未提及的内容</strong><small>首次生成建议保持关闭</small></span></label>
              <p class="xmc-supplement-warning" role="status" hidden>AI 补充内容可能不准确或已经过时，将统一标记为“AI 补充・待核实”。</p>
            </section>
            <label class="xmc-field"><span>还有哪些限制？（可选，每行一条）</span><textarea class="xmc-report-constraints" maxlength="1000" placeholder="预算 800 元&#10;不安排早于 9 点的行程"></textarea></label>
            <div class="xmc-report-actions"><button class="xmc-secondary-button xmc-report-back" type="button">返回选材</button><button class="xmc-primary-button xmc-generate-report" type="button">生成整理手册</button></div>
          </section>
          <section class="xmc-report-panel" data-report-panel="3" hidden>
            <div class="xmc-report-result" aria-live="polite"></div>
          </section>
        </div>
      </section>
      <section class="xmc-manuals-view" hidden>
        <div class="xmc-scroll-area">
          <div class="xmc-section-heading"><div><span class="xmc-index">LIB-01</span><h3>手册</h3></div><span class="xmc-manual-count">0 本</span></div>
          <p class="xmc-manual-status" role="status" aria-live="polite">在报告页点击“保存到手册”后，报告内容会保存在这里。</p>
          <div class="xmc-manual-list" aria-label="已保存的手册"></div>
          <section class="xmc-manual-detail" hidden aria-labelledby="xmc-manual-detail-title">
            <div class="xmc-manual-detail__header">
              <div><span class="xmc-index">LIB-02</span><h3 id="xmc-manual-detail-title">手册内容</h3></div>
              <span class="xmc-manual-detail__meta"></span>
            </div>
            <div class="xmc-manual-result" aria-live="polite"></div>
          </section>
        </div>
      </section>
    </aside>
  `;
  document.documentElement.appendChild(root);

  const elements = {
    addTask: root.querySelector('.xmc-add-task'),
    aiConsent: root.querySelector('.xmc-ai-consent'),
    aiActions: root.querySelector('.xmc-ai-actions'),
    aiActionsHint: root.querySelector('.xmc-ai-actions__hint'),
    accountEmail: root.querySelector('.xmc-account-email'),
    accountFeedback: root.querySelector('.xmc-account-feedback'),
    accountName: root.querySelector('.xmc-account-name'),
    authSignIn: root.querySelector('.xmc-auth-sign-in'),
    authSignOut: root.querySelector('.xmc-auth-sign-out'),
    capture: root.querySelector('.xmc-capture'),
    captureHint: root.querySelector('.xmc-capture__hint'),
    captureLabel: root.querySelector('.xmc-capture__label'),
    drawerCapture: root.querySelector('.xmc-drawer-capture'),
    drawerCaptureHint: root.querySelector('.xmc-drawer-capture__hint'),
    drawerCaptureLabel: root.querySelector('.xmc-drawer-capture__label'),
    clear: root.querySelector('.xmc-clear'),
    collapseAll: root.querySelector('.xmc-collapse-all'),
    cloudAccount: root.querySelector('.xmc-cloud-account'),
    cloudAiStatus: root.querySelector('.xmc-cloud-ai-status'),
    close: root.querySelector('.xmc-close'),
    connection: root.querySelector('.xmc-connection'),
    count: root.querySelector('.xmc-count'),
    dock: root.querySelector('.xmc-dock'),
    drawer: root.querySelector('.xmc-drawer'),
    enableAi: root.querySelector('.xmc-enable-ai'),
    feedback: root.querySelector('.xmc-feedback'),
    footerCount: root.querySelector('.xmc-footer__count'),
    expandAll: root.querySelector('.xmc-expand-all'),
    generateReport: root.querySelector('.xmc-generate-report'),
    list: root.querySelector('.xmc-list'),
    newTask: root.querySelector('.xmc-new-task'),
    materialsView: root.querySelector('.xmc-materials-view'),
    manualsView: root.querySelector('.xmc-manuals-view'),
    manualCount: root.querySelector('.xmc-manual-count'),
    manualDetail: root.querySelector('.xmc-manual-detail'),
    manualDetailMeta: root.querySelector('.xmc-manual-detail__meta'),
    manualList: root.querySelector('.xmc-manual-list'),
    manualResult: root.querySelector('.xmc-manual-result'),
    manualStatus: root.querySelector('.xmc-manual-status'),
    reportConstraints: root.querySelector('.xmc-report-constraints'),
    reportBack: root.querySelector('.xmc-report-back'),
    reportFamiliarityOptions: root.querySelector('.xmc-familiarity-options'),
    reportFamiliaritySection: root.querySelector('.xmc-familiarity-section'),
    reportFamiliarity: [...root.querySelectorAll('.xmc-familiarity-options input')],
    familiarityTip: root.querySelector('.xmc-familiarity-tip'),
    reportGoal: root.querySelector('.xmc-report-goal'),
    reportMaterialList: root.querySelector('.xmc-report-material-list'),
    reportNext: root.querySelector('.xmc-report-next'),
    reportPreset: root.querySelector('.xmc-report-preset'),
    reportPanels: [...root.querySelectorAll('.xmc-report-panel')],
    reportResult: root.querySelector('.xmc-report-result'),
    reportScrollArea: root.querySelector('.xmc-report-view > .xmc-scroll-area'),
    reportSelectedCount: root.querySelector('.xmc-report-selected-count'),
    reportSteps: [...root.querySelectorAll('.xmc-report-step')],
    reportStatus: root.querySelector('.xmc-report-status'),
    reportSupplement: root.querySelector('.xmc-report-supplement input'),
    supplementWarning: root.querySelector('.xmc-supplement-warning'),
    reportView: root.querySelector('.xmc-report-view'),
    runAiAll: root.querySelector('.xmc-run-ai-all'),
    saveSettings: root.querySelector('.xmc-save-settings'),
    secretToggle: root.querySelector('.xmc-secret-toggle'),
    settingsApiKey: root.querySelector('.xmc-settings-api-key'),
    settingsBack: root.querySelector('.xmc-settings-back'),
    settingsBaseUrl: root.querySelector('.xmc-settings-base-url'),
    settingsFeedback: root.querySelector('.xmc-settings-feedback'),
    settingsForm: root.querySelector('.xmc-settings-form'),
    settingsModel: root.querySelector('.xmc-settings-model'),
    settingsMode: root.querySelector('.xmc-settings-mode'),
    settingsProvider: root.querySelector('.xmc-settings-provider'),
    settingsTitle: root.querySelector('.xmc-settings-title'),
    settingsToggle: root.querySelector('.xmc-settings-toggle'),
    settingsView: root.querySelector('.xmc-settings-view'),
    taskName: root.querySelector('#xmc-task-name'),
    taskSelect: root.querySelector('.xmc-task-select'),
    toast: root.querySelector('.xmc-toast'),
    toastDetail: root.querySelector('.xmc-toast__detail'),
    toastThumb: root.querySelector('.xmc-toast__thumb'),
    toastTitle: root.querySelector('.xmc-toast__title'),
    testSettings: root.querySelector('.xmc-test-settings'),
    viewTabs: [...root.querySelectorAll('.xmc-view-tab')],
  };

  let repository;
  let storage;
  let analysisState = {
    version: 1, enabled: false, consentedAt: '', records: [],
  };
  let pageResult = { ready: false, reason: 'note-not-ready' };
  let busy = false;
  let clearArmedTaskId = '';
  let clearArmedUntil = 0;
  let evaluationTimer = null;
  let lastUrl = window.location.href;
  let toastTimer = null;
  let activeView = 'materials';
  let expandedMaterialIds = new Set();
  let settingsOpen = false;
  let reportRepository;
  let manualRepository;
  let selectedReportMaterialIds = new Set();
  let reportBusy = false;
  let reportError = '';
  let reportStep = 1;
  let workbookPageIndex = 0;
  let reportInputTaskId = null;
  let activeManual = null;

  elements.settingsProvider.innerHTML = XhsProviderPresets.listProviderPresets()
    .map((preset) => `<option value="${preset.id}">${preset.label}</option>`)
    .join('');

  async function reloadAnalysisState() {
    const stored = await storage.get(XhsAnalysisRepository.ANALYSIS_STATE_KEY);
    analysisState = stored[XhsAnalysisRepository.ANALYSIS_STATE_KEY]
      || { version: 1, enabled: false, consentedAt: '', records: [] };
  }

  function materialWithAnalysis(material) {
    const record = analysisState.records.find((item) => item.materialId === material.id);
    const current = record && record.contentHash === material.contentHash ? record : null;
    return {
      ...material,
      analysisStatus: analysisState.enabled ? (current ? current.status : 'pending') : 'disabled',
      analysisError: current ? current.error : null,
      contentBrief: current?.brief ? XhsUiModel.getBriefView(current.brief) : null,
    };
  }

  function setDrawer(open) {
    root.classList.toggle('xmc-is-open', open);
    elements.drawer.setAttribute('aria-hidden', String(!open));
    elements.drawer.inert = !open;
    elements.dock.setAttribute('aria-expanded', String(open));
    if (open) {
      elements.close.focus({ preventScroll: true });
    } else {
      elements.dock.focus({ preventScroll: true });
    }
  }

  function scrollReportToTop() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!activeManual) {
      elements.reportScrollArea.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    elements.manualsView.querySelector('.xmc-scroll-area')?.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }

  function focusWorkbookControl(direction, resultRoot = activeManual ? elements.manualResult : elements.reportResult) {
    window.requestAnimationFrame(() => {
      const preferred = resultRoot?.querySelector(`.xmc-workbook-${direction}`);
      const fallbackDirection = direction === 'previous' ? 'next' : 'previous';
      const fallback = resultRoot?.querySelector(`.xmc-workbook-${fallbackDirection}`);
      const target = preferred?.disabled ? fallback : preferred;
      target?.focus({ preventScroll: true });
    });
  }

  function setFeedback(message, tone = 'neutral') {
    elements.feedback.textContent = message;
    elements.feedback.dataset.tone = tone;
  }

  function setConnectionState(state, label) {
    elements.connection.dataset.state = state;
    elements.connection.textContent = label;
  }

  function setActiveView(view) {
    activeView = ['report', 'manuals'].includes(view) ? view : 'materials';
    if (activeView !== 'manuals') activeManual = null;
    settingsOpen = false;
    elements.settingsView.hidden = true;
    elements.materialsView.hidden = activeView !== 'materials';
    elements.reportView.hidden = activeView !== 'report';
    elements.manualsView.hidden = activeView !== 'manuals';
    elements.viewTabs.forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === activeView));
    });
    if (activeView === 'report') renderReportView();
    if (activeView === 'manuals') renderManuals();
  }

  async function loadSettingsView() {
    setConnectionState('testing', '正在检查');
    try {
      const authResponse = await chrome.runtime.sendMessage({ type: 'XMC_GET_AUTH_STATUS' });
      if (authResponse?.ok && authResponse.status?.mode === 'cloud') {
        renderCloudAccount(authResponse.status);
        return;
      }
      elements.settingsTitle.textContent = '模型设置';
      elements.settingsForm.hidden = false;
      elements.cloudAccount.hidden = true;
      elements.settingsFeedback.textContent = '正在读取本地模型配置…';
      elements.settingsFeedback.dataset.tone = 'neutral';
      const settingsMessageType = elements.settingsMode.value === 'local' ? 'XMC_GET_SETTINGS' : 'XMC_GET_PROVIDER_SETTINGS';
      const response = await chrome.runtime.sendMessage({ type: settingsMessageType, mode: elements.settingsMode.value });
      if (!response?.ok) throw new Error(response?.error || '无法读取配置');
      const settings = response.settings;
      elements.settingsBaseUrl.value = settings.baseUrl;
      elements.settingsModel.value = settings.model;
      elements.settingsProvider.value = settings.providerId || XhsProviderPresets.inferProviderId(settings.baseUrl);
      elements.settingsApiKey.value = '';
      elements.settingsApiKey.placeholder = settings.hasApiKey ? '已保存，修改时重新输入' : '输入 API 密钥';
      setConnectionState(settings.hasApiKey && settings.baseUrl ? 'configured' : 'unknown', settings.hasApiKey ? '已配置' : '未配置');
      elements.settingsFeedback.textContent = settings.hasApiKey
        ? '配置已保存。密钥不会显示在页面中。'
        : '填写模型服务后，先测试连接再保存。';
    } catch (error) {
      setConnectionState('failed', '服务离线');
      elements.settingsFeedback.textContent = error.message;
      elements.settingsFeedback.dataset.tone = 'error';
    }
  }

  function renderCloudAccount(status) {
    const authenticated = Boolean(status?.authenticated && status.account);
    const account = status?.account || {};
    elements.settingsTitle.textContent = '账号与云端服务';
    elements.settingsForm.hidden = true;
    elements.cloudAccount.hidden = false;
    elements.accountName.textContent = authenticated ? (account.name || '拾集用户') : '尚未登录';
    elements.accountEmail.textContent = authenticated ? (account.email || '账号已连接') : '登录后连接云端服务';
    elements.cloudAiStatus.textContent = authenticated ? '已连接' : '待登录';
    elements.authSignIn.hidden = authenticated;
    elements.authSignOut.hidden = !authenticated;
    elements.accountFeedback.textContent = authenticated
      ? '账号连接正常，可以使用云端整理。'
      : '登录后即可使用云端整理。';
    elements.accountFeedback.dataset.tone = authenticated ? 'success' : 'neutral';
    setConnectionState(authenticated ? 'connected' : 'unknown', authenticated ? '云端已连接' : '待登录');
  }

  async function runAuthAction(type) {
    elements.authSignIn.disabled = true;
    elements.authSignOut.disabled = true;
    elements.accountFeedback.textContent = type === 'XMC_AUTH_SIGN_IN' ? '正在打开登录…' : '正在退出…';
    elements.accountFeedback.dataset.tone = 'neutral';
    try {
      const response = await chrome.runtime.sendMessage({ type });
      if (!response?.ok) throw new Error(response?.error || '账号操作失败');
      renderCloudAccount(response.status);
    } catch (error) {
      elements.accountFeedback.textContent = error.message;
      elements.accountFeedback.dataset.tone = 'error';
      setConnectionState('failed', '账号异常');
    } finally {
      elements.authSignIn.disabled = false;
      elements.authSignOut.disabled = false;
    }
  }

  function openSettings() {
    settingsOpen = true;
    elements.materialsView.hidden = true;
    elements.reportView.hidden = true;
    elements.settingsView.hidden = false;
    loadSettingsView();
  }

  function settingsPayload() {
    return {
      baseUrl: elements.settingsBaseUrl.value,
      model: elements.settingsModel.value,
      apiKey: elements.settingsApiKey.value,
      mode: elements.settingsMode.value,
      providerId: elements.settingsProvider.value,
    };
  }

  function reportCandidates() {
    const state = repository.getState();
    const currentMaterials = repository.listMaterials(state.currentTaskId);
    const ids = new Set(XhsUiModel.getReportCandidateIds(currentMaterials, analysisState.records));
    return currentMaterials.filter((material) => ids.has(material.id));
  }

  function renderReportMaterialChoices(candidates, report) {
    selectedReportMaterialIds = XhsUiModel.restoreReportSelection(
      candidates,
      selectedReportMaterialIds,
      report,
    );
    elements.reportMaterialList.replaceChildren();
    if (!candidates.length) {
      appendTextElement(elements.reportMaterialList, 'p', 'xmc-report-empty', '先完成至少两条素材的 AI 整理。');
      elements.reportSelectedCount.textContent = '已选择 0 条';
      return;
    }
    candidates.forEach((material) => {
      const article = document.createElement('article');
      article.className = 'xmc-report-material';
      if (material.coverUrl) {
        const image = document.createElement('img');
        image.src = material.coverUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        article.appendChild(image);
      } else {
        appendTextElement(article, 'span', 'xmc-report-material__placeholder', '文');
      }
      const copy = document.createElement('span');
      appendTextElement(copy, 'strong', '', material.title);
      appendTextElement(copy, 'small', '', materialWithAnalysis(material).contentBrief?.oneLineSummary || '已完成整理');
      article.appendChild(copy);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'xmc-report-material-toggle';
      function syncToggle() {
        const selected = selectedReportMaterialIds.has(material.id);
        toggle.setAttribute('aria-pressed', String(selected));
        toggle.textContent = selected ? '✓ 已选' : '＋ 加入';
      }
      syncToggle();
      toggle.addEventListener('click', () => {
        if (selectedReportMaterialIds.has(material.id)) selectedReportMaterialIds.delete(material.id);
        else selectedReportMaterialIds.add(material.id);
        syncToggle();
        updateReportStepAvailability(report);
        if (report) elements.reportStatus.textContent = '选择已变化';
      });
      article.appendChild(toggle);
      elements.reportMaterialList.appendChild(article);
    });
    elements.reportSelectedCount.textContent = `已选择 ${selectedReportMaterialIds.size} 条`;
  }

  function updateReportStepAvailability(record) {
    const context = {
      selectedCount: selectedReportMaterialIds.size,
      goal: elements.reportGoal.value,
      hasReport: Boolean(record),
    };
    elements.reportSelectedCount.textContent = `已选择 ${selectedReportMaterialIds.size} 条`;
    elements.reportNext.disabled = !XhsUiModel.canAdvanceReportStep(1, context);
    elements.generateReport.disabled = reportBusy || !XhsUiModel.canAdvanceReportStep(2, context);
    elements.reportSteps.forEach((button) => {
      const step = Number(button.dataset.reportStep);
      button.setAttribute('aria-current', step === reportStep ? 'step' : 'false');
      button.disabled = step === 2
        ? !XhsUiModel.canAdvanceReportStep(1, context)
        : step === 3 && !record;
    });
    elements.reportPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.reportPanel) !== reportStep;
    });
  }

  function setReportStep(nextStep, record = null) {
    const target = XhsUiModel.clampReportStep(nextStep);
    const context = {
      selectedCount: selectedReportMaterialIds.size,
      goal: elements.reportGoal.value,
      hasReport: Boolean(record),
    };
    if (target === 2 && !XhsUiModel.canAdvanceReportStep(1, context)) {
      elements.reportStatus.textContent = '至少选择两条素材';
      return;
    }
    if (target === 3 && !record) {
      elements.reportStatus.textContent = '请先生成手册';
      return;
    }
    reportStep = target;
    updateReportStepAvailability(record);
    scrollReportToTop();
  }

  function appendWorkbookGallery(parent, materials, limit = 3) {
    const gallery = document.createElement('div');
    gallery.className = 'xmc-workbook-gallery';
    materials.slice(0, limit).forEach((material, index) => {
      const figure = document.createElement('figure');
      figure.style.setProperty('--xmc-photo-index', String(index));
      if (material.coverUrl) {
        const image = document.createElement('img');
        image.src = material.coverUrl;
        image.alt = material.title;
        image.referrerPolicy = 'no-referrer';
        figure.appendChild(image);
      } else {
        appendTextElement(figure, 'span', 'xmc-workbook-photo-placeholder', '素材');
      }
      appendTextElement(figure, 'figcaption', '', material.title);
      gallery.appendChild(figure);
    });
    parent.appendChild(gallery);
  }

  function appendWorkbookList(parent, items, className) {
    const list = document.createElement('ol');
    list.className = className;
    (items || []).forEach((item, index) => {
      const row = document.createElement('li');
      row.style.setProperty('--xmc-item-index', String(index));
      appendTextElement(row, 'span', 'xmc-workbook-item-number', String(index + 1));
      const copy = document.createElement('span');
      appendTextElement(copy, 'strong', '', typeof item === 'string' ? item : item.text);
      appendStatementMeta(copy, item);
      row.appendChild(copy);
      list.appendChild(row);
    });
    parent.appendChild(list);
  }

  function appendStatementMeta(parent, item) {
    if (!item || typeof item === 'string') return;
    if (item.origin === 'user') {
      appendTextElement(parent, 'small', 'xmc-workbook-origin', '用户要求');
    }
    if (Array.isArray(item.citationIds) && item.citationIds.length) {
      appendTextElement(parent, 'small', 'xmc-workbook-citations', item.citationIds.map((id) => `[${id}]`).join(' '));
    }
    if (item.verificationStatus === 'needs_verification') {
      appendTextElement(
        parent,
        'small',
        'xmc-workbook-verification',
        `待核实${item.verificationNote ? ` · ${item.verificationNote}` : ''}`,
      );
    }
  }

  function appendTutorialActions(parent, items) {
    const list = document.createElement('div');
    list.className = 'xmc-tutorial-action-list';
    if (!(items || []).length) {
      appendTextElement(list, 'p', 'xmc-report-empty', '素材没有提供可验证的开始操作。');
    }
    (items || []).forEach((item) => {
      const card = document.createElement('article');
      card.className = 'xmc-tutorial-action';
      appendTextElement(card, 'h4', '', item.title);
      const details = document.createElement('dl');
      const appendDetail = (label, value, steps = false) => {
        appendTextElement(details, 'dt', '', label);
        const description = document.createElement('dd');
        if (steps) {
          const ordered = document.createElement('ol');
          if ((value || []).length) {
            value.forEach((step) => appendTextElement(ordered, 'li', '', step));
          } else {
            appendTextElement(ordered, 'li', 'xmc-report-empty', '素材未提供具体操作。');
          }
          description.appendChild(ordered);
        } else {
          description.textContent = value;
        }
        details.appendChild(description);
      };
      appendDetail('用途', item.purpose);
      appendDetail('操作', item.steps, true);
      appendDetail('完成标志', item.successCheck);
      appendDetail('失败处理', item.fallback);
      card.appendChild(details);
      appendStatementMeta(card, item);
      list.appendChild(card);
    });
    parent.appendChild(list);
  }

  function appendSupplements(parent, supplements) {
    if (!(supplements || []).length) return;
    const section = document.createElement('section');
    section.className = 'xmc-workbook-supplements';
    appendTextElement(section, 'h4', '', 'AI 补充・待核实');
    supplements.forEach((item) => {
      const article = document.createElement('article');
      appendTextElement(article, 'p', '', item.text);
      appendTextElement(article, 'small', '', item.verificationNote || '请在执行前核实。');
      section.appendChild(article);
    });
    parent.appendChild(section);
  }

  function appendTravelCards(parent, items, cardClass, emptyText, statusLabel = '') {
    const list = document.createElement('div');
    list.className = 'xmc-travel-card-list';
    if (!(items || []).length) {
      appendTextElement(list, 'p', 'xmc-report-empty', emptyText);
    }
    (items || []).forEach((item, index) => {
      const card = document.createElement('article');
      card.className = cardClass;
      appendTextElement(card, 'span', 'xmc-travel-card-number', String(index + 1));
      if (statusLabel) appendTextElement(card, 'span', 'xmc-travel-card-status', statusLabel);
      const copy = document.createElement('div');
      appendTextElement(copy, 'strong', '', typeof item === 'string' ? item : item.text);
      appendStatementMeta(copy, item);
      card.appendChild(copy);
      list.appendChild(card);
    });
    parent.appendChild(list);
  }

  function appendTravelChecklist(parent, items, emptyText) {
    const list = document.createElement('ul');
    list.className = 'xmc-travel-checklist';
    if (!(items || []).length) {
      appendTextElement(list, 'li', 'xmc-travel-checklist-empty', emptyText);
    }
    (items || []).forEach((item) => {
      const row = document.createElement('li');
      appendTextElement(row, 'span', 'xmc-travel-check-box', '');
      appendTextElement(row, 'span', '', typeof item === 'string' ? item : item.text);
      list.appendChild(row);
    });
    parent.appendChild(list);
  }

  function appendWorkbookSources(parent, citations, materials) {
    if (!(citations || []).length) {
      appendTextElement(parent, 'p', 'xmc-report-empty', '当前报告没有可展示的来源目录。');
      return;
    }
    citations.forEach((citation) => {
      const resolved = XhsUiModel.resolveReportCitation(citation, materials, analysisState.records);
      const details = document.createElement('details');
      details.className = 'xmc-workbook-source';
      const summary = document.createElement('summary');
      summary.textContent = `${citation.id} · ${resolved.materialTitle}`;
      details.appendChild(summary);
      if (resolved.quotes.length) {
        resolved.quotes.forEach((quote) => appendTextElement(details, 'blockquote', '', quote));
      } else {
        appendTextElement(details, 'p', '', `证据编号：${citation.evidenceIds.join(', ')}`);
      }
      parent.appendChild(details);
    });
  }

  function renderWorkbookPage(parent, page, report, materials) {
    const pageClass = {
      cover: 'xmc-workbook-cover',
      overview: 'xmc-workbook-overview',
      timeline: 'xmc-workbook-timeline',
      risks: 'xmc-workbook-risks',
      sources: 'xmc-workbook-sources',
      'travel-cover': 'xmc-travel-cover',
      'travel-itinerary': 'xmc-travel-itinerary',
      'travel-rationale': 'xmc-travel-rationale',
      'travel-preparation': 'xmc-travel-preparation',
      'travel-verify': 'xmc-travel-verify',
      'tutorial-start': 'xmc-tutorial-start',
      'tutorial-overview': 'xmc-tutorial-overview',
      'tutorial-steps': 'xmc-tutorial-steps',
      'tutorial-verify': 'xmc-tutorial-verify',
      'tutorial-sources': 'xmc-tutorial-sources',
    }[page.kind];
    const sheet = document.createElement('section');
    sheet.className = `xmc-workbook-page ${pageClass}`;
    const binding = document.createElement('span');
    binding.className = 'xmc-workbook-binding';
    binding.setAttribute('aria-hidden', 'true');
    sheet.appendChild(binding);
    const washi = document.createElement('span');
    washi.className = 'xmc-workbook-washi';
    washi.setAttribute('aria-hidden', 'true');
    sheet.appendChild(washi);
    const pageLabels = {
      cover: '封面',
      overview: '总览',
      timeline: '路线',
      risks: '核验',
      sources: '来源',
      'travel-cover': '旅行手账',
      'travel-itinerary': '行程',
      'travel-rationale': '取舍',
      'travel-preparation': '准备',
      'travel-verify': '确认',
      'tutorial-start': '开始',
      'tutorial-overview': '理解',
      'tutorial-steps': '步骤',
      'tutorial-verify': '核验',
      'tutorial-sources': '来源',
    };
    appendTextElement(sheet, 'span', 'xmc-workbook-index-tab', pageLabels[page.kind]);
    if (page.kind === 'tutorial-start') {
      appendTextElement(sheet, 'span', 'xmc-workbook-stamp', '教程拆解');
      appendTextElement(sheet, 'p', 'xmc-index', 'START HERE');
      appendTextElement(sheet, 'h3', '', page.title || '开始操作');
      appendTextElement(sheet, 'p', 'xmc-workbook-meta', report.familiarityLevel === 'informed' ? '有一点了解' : '零基础');
      appendTextElement(sheet, 'p', 'xmc-workbook-lead', page.summary || '先完成素材中有依据的准备，再进入主体步骤。');
      appendTutorialActions(sheet, page.items);
    } else if (page.kind === 'tutorial-overview') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-02 · 任务理解');
      appendTextElement(sheet, 'h3', '', '先看清目标和条件');
      appendWorkbookGallery(sheet, page.materials, 2);
      appendTextElement(sheet, 'p', 'xmc-workbook-lead', page.summary);
      appendWorkbookList(sheet, page.items, 'xmc-workbook-theme-list');
    } else if (page.kind === 'tutorial-steps') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-03 · 操作步骤');
      appendTextElement(sheet, 'h3', '', '按顺序完成操作');
      if (page.items.length) appendWorkbookList(sheet, page.items, 'xmc-workbook-plain-list');
      else appendTextElement(sheet, 'p', 'xmc-report-empty', '素材没有提供可验证的操作步骤。');
    } else if (page.kind === 'tutorial-verify') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-04 · 完成核验');
      appendTextElement(sheet, 'h3', '', '检查结果和待补信息');
      const conflicts = document.createElement('section');
      conflicts.className = 'xmc-workbook-alert xmc-workbook-alert--risk';
      appendTextElement(conflicts, 'h4', '', '冲突与易错点');
      if (page.conflicts.length) appendWorkbookList(conflicts, page.conflicts, 'xmc-workbook-plain-list');
      else appendTextElement(conflicts, 'p', '', '所选素材中没有发现明显冲突。');
      sheet.appendChild(conflicts);
      const gaps = document.createElement('section');
      gaps.className = 'xmc-workbook-alert xmc-workbook-alert--gap';
      appendTextElement(gaps, 'h4', '', '仍需核实');
      if (page.gaps.length) appendWorkbookList(gaps, page.gaps, 'xmc-workbook-plain-list');
      else appendTextElement(gaps, 'p', '', '当前没有额外信息缺口。');
      sheet.appendChild(gaps);
      appendSupplements(sheet, page.supplements);
    } else if (page.kind === 'tutorial-sources') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-05 · 来源核验');
      appendTextElement(sheet, 'h3', '', '每一步来自哪些素材');
      appendWorkbookSources(sheet, page.citations, materials);
    } else if (page.kind === 'travel-cover') {
      appendTextElement(sheet, 'span', 'xmc-workbook-stamp', '旅行手账');
      appendTextElement(sheet, 'p', 'xmc-index', 'TRAVEL JOURNAL');
      appendTextElement(sheet, 'h3', '', page.title || '旅行整理手账');
      appendTextElement(sheet, 'p', 'xmc-workbook-meta', `使用 ${materials.length} 条素材 · ${String(report.generatedAt || '').slice(0, 10) || '刚刚生成'}`);
      appendTextElement(sheet, 'p', 'xmc-workbook-lead', page.summary || '素材已整理，等待补充旅行摘要。');
      if (page.constraints.length) {
        const constraints = document.createElement('div');
        constraints.className = 'xmc-travel-constraints';
        appendTextElement(constraints, 'strong', '', '本次限制');
        page.constraints.forEach((item) => appendTextElement(constraints, 'span', '', item));
        sheet.appendChild(constraints);
      }
      appendWorkbookGallery(sheet, page.materials, 2);
    } else if (page.kind === 'travel-itinerary') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-02 · 行程草案');
      appendTextElement(sheet, 'h3', '', '把选择排成行程');
      appendTextElement(sheet, 'p', 'xmc-travel-section-note', '按报告给出的行动顺序整理，具体时间和交通仍以核验结果为准。');
      const itinerary = document.createElement('section');
      itinerary.className = 'xmc-travel-itinerary-track';
      appendTravelCards(itinerary, page.items, 'xmc-travel-stop-card', '当前报告没有给出可排列的行动。');
      sheet.appendChild(itinerary);
    } else if (page.kind === 'travel-rationale') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-03 · 取舍理由');
      appendTextElement(sheet, 'h3', '', '为什么这样排');
      appendTextElement(sheet, 'p', 'xmc-travel-section-note', '只展示素材与报告中已有的推荐理由，并保留来源编号。');
      appendTravelCards(sheet, page.items, 'xmc-travel-decision-card', '当前报告没有给出明确的选择理由。', '素材依据');
    } else if (page.kind === 'travel-preparation') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-04 · 出发准备');
      appendTextElement(sheet, 'h3', '', '出发前，一项项准备好');
      const budget = document.createElement('section');
      budget.className = 'xmc-travel-budget';
      appendTextElement(budget, 'h4', '', '预算依据');
      appendTravelCards(budget, page.budgetItems, 'xmc-travel-budget-row', '素材未确认预算金额，请出发前核实。');
      sheet.appendChild(budget);
      if (page.constraints.length) {
        const limits = document.createElement('section');
        limits.className = 'xmc-travel-limits';
        appendTextElement(limits, 'h4', '', '用户限制');
        appendTravelChecklist(limits, page.constraints, '未填写额外限制。');
        sheet.appendChild(limits);
      }
      const checklist = document.createElement('section');
      checklist.className = 'xmc-travel-prep-checklist';
      appendTextElement(checklist, 'h4', '', '待补清单');
      appendTravelChecklist(checklist, page.checklist, '当前没有待补信息。');
      sheet.appendChild(checklist);
    } else if (page.kind === 'travel-verify') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-05 · 出发核验');
      appendTextElement(sheet, 'h3', '', '出发前再确认一次');
      const conflicts = document.createElement('section');
      conflicts.className = 'xmc-travel-notice xmc-travel-notice--danger';
      appendTextElement(conflicts, 'h4', '', '冲突与风险预警');
      appendTravelCards(conflicts, page.conflicts, 'xmc-travel-verify-row', '所选素材中没有发现明显冲突。');
      sheet.appendChild(conflicts);
      const gaps = document.createElement('section');
      gaps.className = 'xmc-travel-notice xmc-travel-notice--warning';
      appendTextElement(gaps, 'h4', '', '待核实信息');
      appendTravelCards(gaps, page.gaps, 'xmc-travel-verify-row', '当前没有额外信息缺口。');
      sheet.appendChild(gaps);
      const confirmation = document.createElement('section');
      confirmation.className = 'xmc-travel-confirmation';
      appendTextElement(confirmation, 'h4', '', '用户确认');
      appendTravelChecklist(confirmation, page.checklist, '当前没有待确认项目。');
      sheet.appendChild(confirmation);
      appendSupplements(sheet, page.supplements);
      const sources = document.createElement('section');
      sources.className = 'xmc-travel-sources';
      appendTextElement(sources, 'h4', '', '来源依据');
      appendWorkbookSources(sources, page.citations, materials);
      sheet.appendChild(sources);
    } else if (page.kind === 'cover') {
      appendTextElement(sheet, 'span', 'xmc-workbook-stamp', '目的手册');
      appendTextElement(sheet, 'p', 'xmc-index', 'SHIJI WORKBOOK');
      appendTextElement(sheet, 'h3', '', page.title);
      appendTextElement(sheet, 'p', 'xmc-workbook-meta', `使用 ${materials.length} 条素材 · ${String(report.generatedAt || '').slice(0, 10) || '刚刚生成'}`);
      appendWorkbookGallery(sheet, materials);
      appendTextElement(sheet, 'p', 'xmc-workbook-lead', page.summary);
    } else if (page.kind === 'overview') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-02 · 总览');
      appendTextElement(sheet, 'h3', '', '先看清方向，再开始执行');
      appendWorkbookGallery(sheet, page.materials, 2);
      appendTextElement(sheet, 'p', 'xmc-workbook-lead', page.summary);
      appendWorkbookList(sheet, page.items, 'xmc-workbook-theme-list');
    } else if (page.kind === 'timeline') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-03 · 执行路线');
      appendTextElement(sheet, 'h3', '', '把下一步排成清晰顺序');
      const route = document.createElement('div');
      route.className = 'xmc-workbook-route';
      if (page.items.length) appendWorkbookList(route, page.items, 'xmc-workbook-timeline-list');
      else appendTextElement(sheet, 'p', 'xmc-report-empty', '当前报告没有给出可执行步骤。');
      if (page.items.length) sheet.appendChild(route);
    } else if (page.kind === 'risks') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-04 · 风险检查');
      appendTextElement(sheet, 'h3', '', '哪些地方需要核实');
      const conflicts = document.createElement('section');
      conflicts.className = 'xmc-workbook-alert xmc-workbook-alert--risk';
      appendTextElement(conflicts, 'h4', '', '冲突与分歧');
      appendTextElement(conflicts, 'span', 'xmc-workbook-risk-stamp', 'RISK');
      if (page.conflicts.length) appendWorkbookList(conflicts, page.conflicts, 'xmc-workbook-plain-list');
      else appendTextElement(conflicts, 'p', '', '所选素材中没有发现明显冲突。');
      sheet.appendChild(conflicts);
      const gaps = document.createElement('section');
      gaps.className = 'xmc-workbook-alert xmc-workbook-alert--gap';
      appendTextElement(gaps, 'h4', '', '仍需补充');
      if (page.gaps.length) appendWorkbookList(gaps, page.gaps, 'xmc-workbook-plain-list');
      else appendTextElement(gaps, 'p', '', '当前没有额外信息缺口。');
      sheet.appendChild(gaps);
      appendSupplements(sheet, page.supplements);
    } else if (page.kind === 'sources') {
      appendTextElement(sheet, 'p', 'xmc-index', 'PAGE-05 · 来源核验');
      appendTextElement(sheet, 'h3', '', '结论来自哪些素材');
      appendWorkbookSources(sheet, page.citations, materials);
    }
    parent.appendChild(sheet);
  }

  function exportWorkbookPdf(record, materials) {
    const savedPageIndex = workbookPageIndex;
    const resultRoot = activeManual ? elements.manualResult : elements.reportResult;
    const pages = XhsUiModel.buildWorkbookPages(record, materials);
    let resolveExport;
    const completion = new Promise((resolve) => { resolveExport = resolve; });
    const exporter = XhsWorkbookExport.createWorkbookPdfExporter({
      windowObj: window,
      documentObj: document,
      root,
      renderPages(printRoot) {
        renderWorkbookPrintPages(printRoot, pages, record, materials);
      },
      onRestore() {
        workbookPageIndex = savedPageIndex;
        renderReportResult(record, resultRoot);
        resolveExport();
      },
      onError(message) {
        renderReportResult(record, resultRoot);
        const notice = appendTextElement(resultRoot, 'p', 'xmc-report-notice xmc-report-notice--error', message);
        resultRoot.prepend(notice);
        resolveExport();
      },
    });
    exporter.exportPdf();
    return completion;
  }

  async function exportWorkbookImages(record, materials, pageNumbers, format) {
    const pages = XhsUiModel.buildWorkbookPages(record, materials);
    let exportError = '';
    const exporter = XhsWorkbookExport.createWorkbookImageExporter({
      windowObj: window,
      documentObj: document,
      root,
      renderer: 'html2canvas',
      canvasMode: WORKBOOK_IMAGE_CANVAS_MODE,
      pageNumbers,
      renderPages(printRoot) {
        renderWorkbookPrintPages(printRoot, pages, record, materials);
      },
      onRestore() {},
      onError(message) {
        exportError = message;
      },
    });
    const success = await exporter.exportImages(format);
    if (!success) {
      throw new Error(exportError || `导出 ${String(format).toUpperCase()} 失败`);
    }
    return { pageNumbers, format };
  }

  async function saveTutorialManual(taskId, goal, report, constraints, familiarityLevel, supplementMode, selected, sourceRevision) {
    if (!manualRepository || !report || report.status === 'failed') return null;
    const reportPreset = XhsUiModel.getReportPreset(report);
    try {
      const manual = await manualRepository.save({
        taskId,
        goal,
        reportPreset,
        status: report.status || 'succeeded',
        report: { ...report, goal, constraints, familiarityLevel, supplementMode },
        materials: selected.map(({ id, title, author, sourceUrl, capturedAt, images, coverUrl }) => ({
          id, title, author, sourceUrl, capturedAt, images, coverUrl,
        })),
        selectedMaterialIds: selected.map((material) => material.id),
        sourceRevision,
      });
      if (activeView === 'manuals') renderManuals();
      return manual;
    } catch (_error) {
      if (elements.manualStatus) {
        elements.manualStatus.textContent = '手册保存失败，当前报告仍可查看。';
        elements.manualStatus.dataset.tone = 'error';
      }
      return null;
    }
  }

  function renderWorkbookPrintPages(printRoot, pages, record, materials) {
    pages.forEach((page) => {
      const frame = document.createElement('section');
      frame.className = 'xmc-workbook-print-page';
      renderWorkbookPage(frame, page, record, materials);
      printRoot.appendChild(frame);
    });
  }

  function renderManuals() {
    if (!manualRepository || !repository) return;
    const manuals = manualRepository.list();
    elements.manualCount.textContent = `${manuals.length} 本`;
    elements.manualList.replaceChildren();
    if (!manuals.length) {
      appendTextElement(elements.manualList, 'div', 'xmc-manual-empty', '暂无手册。生成报告后，可在报告页按需保存。');
      activeManual = null;
      elements.manualDetail.hidden = true;
      elements.manualDetailMeta.textContent = '';
      elements.manualResult.replaceChildren();
      return;
    }
    const state = repository.getState();
    manuals.forEach((manual) => {
      const card = document.createElement('article');
      card.className = 'xmc-manual-card';
      appendTextElement(card, 'h4', 'xmc-manual-card__title', manual.title);
      const task = state.tasks.find((item) => item.id === manual.taskId);
      appendTextElement(card, 'p', 'xmc-manual-card__meta', `${task?.name || '已保存任务'} · ${formatCapturedAt(manual.updatedAt)}`);
      appendTextElement(card, 'p', 'xmc-manual-card__meta', `素材 ${Array.isArray(manual.selectedMaterialIds) ? manual.selectedMaterialIds.length : 0} 条`);
      const actions = document.createElement('div');
      actions.className = 'xmc-manual-card__actions';
      const open = appendTextElement(actions, 'button', 'xmc-secondary-button', '打开手册');
      open.type = 'button';
      open.addEventListener('click', () => openTutorialManual(manual));
      const remove = appendTextElement(actions, 'button', 'xmc-manual-delete', '删除手册');
      remove.type = 'button';
      remove.addEventListener('click', () => removeTutorialManual(manual.id));
      actions.appendChild(open);
      actions.appendChild(remove);
      card.appendChild(actions);
      elements.manualList.appendChild(card);
    });
    elements.manualDetail.hidden = !activeManual;
    if (activeManual) {
      elements.manualDetailMeta.textContent = `${formatCapturedAt(activeManual.updatedAt)} · 保存时快照`;
      renderReportResult(activeManual.report, elements.manualResult);
    } else {
      elements.manualDetailMeta.textContent = '';
      elements.manualResult.replaceChildren();
    }
  }

  function renderReportResult(record, resultRoot = activeManual ? elements.manualResult : elements.reportResult) {
    resultRoot.replaceChildren();
    const displayedRecord = activeManual?.report || record;
    const displayedMaterials = activeManual
      ? (Array.isArray(activeManual.materials) ? activeManual.materials : [])
      : (() => {
        const currentMaterials = repository.listMaterials(repository.getState().currentTaskId);
        const selectedIds = new Set(record?.selectedMaterialIds || []);
        return currentMaterials.filter((material) => selectedIds.has(material.id));
    })();
    if (!displayedRecord) {
      appendTextElement(resultRoot, 'div', 'xmc-report-empty', '选择素材并说明目标后，这里会生成带来源的五页手账。');
      elements.reportStatus.textContent = '尚未生成';
      return;
    }
    elements.reportStatus.textContent = activeManual ? '本地手册' : (record.status === 'stale' ? '素材已变化' : '已生成');
    if (activeManual) {
      appendTextElement(resultRoot, 'p', 'xmc-report-notice', '当前手册为保存时快照，不会随当前素材变化。');
    } else if (record.status === 'stale') {
      appendTextElement(resultRoot, 'p', 'xmc-report-notice', '当前素材已变化，以下是上一次结果。重新生成前不会覆盖。');
    }
    const materials = displayedMaterials;
    const pages = XhsUiModel.buildWorkbookPages(displayedRecord, materials);
    workbookPageIndex = Math.min(Math.max(workbookPageIndex, 0), pages.length - 1);
    const workbook = document.createElement('article');
    workbook.className = 'xmc-workbook';
    renderWorkbookPage(workbook, pages[workbookPageIndex], displayedRecord, materials);
    const controls = document.createElement('footer');
    controls.className = 'xmc-workbook-controls';
    const controlCluster = document.createElement('div');
    controlCluster.className = 'xmc-workbook-control-cluster';
    const previous = appendTextElement(controlCluster, 'button', 'xmc-workbook-prev', '‹');
    previous.type = 'button';
    previous.setAttribute('aria-label', '上一页');
    previous.disabled = workbookPageIndex === 0;
    previous.addEventListener('click', () => {
      workbookPageIndex -= 1;
      renderReportResult(record, resultRoot);
      focusWorkbookControl('previous', resultRoot);
      if (!activeManual) scrollReportToTop();
    });
    appendTextElement(controlCluster, 'span', 'xmc-workbook-page-count', `${workbookPageIndex + 1} / ${pages.length}`);
    const next = appendTextElement(controlCluster, 'button', 'xmc-workbook-next', '›');
    next.type = 'button';
    next.setAttribute('aria-label', '下一页');
    next.disabled = workbookPageIndex === pages.length - 1;
    next.addEventListener('click', () => {
      workbookPageIndex += 1;
      renderReportResult(record, resultRoot);
      focusWorkbookControl('next', resultRoot);
      if (!activeManual) scrollReportToTop();
    });
    controls.appendChild(controlCluster);
    const actionBar = document.createElement('div');
    actionBar.className = 'xmc-workbook-action-bar';
    if (activeManual) {
      const backToManuals = appendTextElement(actionBar, 'button', 'xmc-manual-back', '返回手册');
      backToManuals.type = 'button';
      backToManuals.addEventListener('click', () => {
        activeManual = null;
        renderManuals();
      });
    } else if (!activeManual && displayedRecord.status !== 'failed') {
      const taskId = repository.getState().currentTaskId;
      const selectedIds = Array.isArray(displayedRecord.selectedMaterialIds) ? displayedRecord.selectedMaterialIds : [];
      const existing = manualRepository?.list().find((manual) => (
        manual.taskId === taskId
        && String(manual.goal || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase() === String(displayedRecord.goal || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
        && JSON.stringify([...(manual.selectedMaterialIds || [])].map(String).sort()) === JSON.stringify([...selectedIds].map(String).sort())
      ));
      const saveManual = appendTextElement(actionBar, 'button', 'xmc-workbook-save-manual', existing ? '更新手册' : '保存到手册');
      saveManual.type = 'button';
      saveManual.addEventListener('click', async () => {
        saveManual.disabled = true;
        saveManual.textContent = '保存中…';
        const saved = await saveTutorialManual(
          taskId,
          displayedRecord.goal,
          displayedRecord,
          displayedRecord.constraints || [],
          displayedRecord.familiarityLevel || 'beginner',
          displayedRecord.supplementMode || 'source_only',
          materials,
          displayedRecord.sourceRevision || '',
        );
        saveManual.disabled = false;
        saveManual.textContent = saved ? '已保存到手册' : '保存到手册';
      });
    }
    const exportMenu = document.createElement('details');
    exportMenu.className = 'xmc-workbook-export-menu';
    const exportTrigger = appendTextElement(exportMenu, 'summary', 'xmc-workbook-export-trigger', '导出');
    exportTrigger.title = '选择导出格式';
    exportTrigger.setAttribute('aria-label', '选择导出格式');
    const exportOptions = document.createElement('div');
    exportOptions.className = 'xmc-workbook-export-options';
    const exportOptionButtons = new Map();
    [['pdf', '导出 PDF'], ['png', '导出 PNG'], ['jpg', '导出 JPG']].forEach(([format, label]) => {
      const option = appendTextElement(exportOptions, 'button', 'xmc-workbook-export-option', label);
      option.type = 'button';
      option.dataset.exportFormat = format;
      exportOptionButtons.set(format, option);
    });
    exportMenu.appendChild(exportOptions);
    if (ENABLE_WORKBOOK_IMAGE_EXPORT) {
      const prototype = document.createElement('details');
      prototype.className = 'xmc-workbook-image-export';
      const trigger = appendTextElement(prototype, 'summary', 'xmc-workbook-image-trigger', '选择图片页');
      trigger.setAttribute('aria-label', '导出 PNG 或 JPG 图片');
      const panel = document.createElement('div');
      panel.className = 'xmc-workbook-image-panel';
      appendTextElement(panel, 'strong', '', '选择导出页');
      const choices = document.createElement('div');
      choices.className = 'xmc-workbook-image-pages';
      for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
        const choice = appendTextElement(choices, 'button', 'xmc-workbook-image-page', String(pageNumber));
        choice.type = 'button';
        choice.value = String(pageNumber);
        choice.setAttribute('aria-pressed', String(pageNumber === workbookPageIndex + 1));
        choice.setAttribute('aria-label', `选择第 ${pageNumber} 页`);
        choice.addEventListener('click', () => {
          const selected = choice.getAttribute('aria-pressed') === 'true';
          choice.setAttribute('aria-pressed', String(!selected));
          syncImageExportSubmit();
        });
      }
      panel.appendChild(choices);
      const formatField = document.createElement('label');
      formatField.className = 'xmc-workbook-image-format';
      appendTextElement(formatField, 'span', '', '格式');
      const formatSelect = document.createElement('select');
      formatSelect.className = 'xmc-workbook-image-format-select';
      formatSelect.setAttribute('aria-label', '选择图片格式');
      [['png', 'PNG'], ['jpg', 'JPG']].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        formatSelect.appendChild(option);
      });
      formatField.appendChild(formatSelect);
      panel.appendChild(formatField);
      const status = appendTextElement(
        panel,
        'p',
        'xmc-workbook-image-status',
        '默认选中当前页，可多选页面。',
      );
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const submit = appendTextElement(panel, 'button', 'xmc-workbook-image-submit', '导出所选页');
      submit.type = 'button';
      function selectedPageNumbers() {
        return [...choices.querySelectorAll('[aria-pressed="true"]')]
          .map((choice) => Number(choice.value));
      }
      function syncImageExportSubmit(updateStatus = true) {
        const hasSelection = selectedPageNumbers().length > 0;
        submit.disabled = !hasSelection;
        if (!updateStatus) return;
        if (!hasSelection && !submit.getAttribute('aria-busy')) {
          status.textContent = '至少选择一页。';
        } else if (hasSelection && !submit.getAttribute('aria-busy')) {
          status.textContent = '默认选中当前页，可多选页面。';
        }
      }
      syncImageExportSubmit();
      submit.addEventListener('click', async () => {
        const pageNumbers = selectedPageNumbers();
        const format = formatSelect.value;
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        formatSelect.disabled = true;
        choices.querySelectorAll('button').forEach((choice) => { choice.disabled = true; });
        submit.textContent = '导出中…';
        status.textContent = `正在本地生成 ${format.toUpperCase()}…`;
        status.dataset.tone = 'neutral';
        setFeedback(`正在本地生成 ${format.toUpperCase()} 图片…`, 'neutral');
        try {
          const result = await exportWorkbookImages(displayedRecord, materials, pageNumbers, format);
          status.textContent = `已导出 ${result.pageNumbers.length} 张 ${format.toUpperCase()}。`;
          status.dataset.tone = 'success';
          setFeedback(`已导出 ${result.pageNumbers.length} 张 ${format.toUpperCase()}。`, 'success');
        } catch (error) {
          status.textContent = `导出失败：${error.message}`;
          status.dataset.tone = 'error';
          setFeedback(`本地图片导出失败：${error.message}`, 'error');
        } finally {
          submit.removeAttribute('aria-busy');
          formatSelect.disabled = false;
          choices.querySelectorAll('button').forEach((choice) => { choice.disabled = false; });
          submit.textContent = '导出所选页';
          syncImageExportSubmit(false);
        }
      });
      panel.appendChild(submit);
      prototype.appendChild(panel);
      prototype.addEventListener('toggle', () => {
        exportMenu.dataset.imageOpen = String(prototype.open);
      });
      exportMenu.appendChild(prototype);
      ['png', 'jpg'].forEach((format) => {
        exportOptionButtons.get(format).addEventListener('click', () => {
          formatSelect.value = format;
          prototype.open = true;
          exportMenu.open = true;
          formatSelect.focus({ preventScroll: true });
        });
      });
    }
    const pdfOption = exportOptionButtons.get('pdf');
    pdfOption.addEventListener('click', () => {
      pdfOption.disabled = true;
      pdfOption.textContent = '正在导出 PDF…';
      exportMenu.open = false;
      setFeedback('正在准备导出 PDF…', 'neutral');
      let result;
      try {
        result = exportWorkbookPdf(displayedRecord, materials);
      } catch (error) {
        pdfOption.disabled = false;
        pdfOption.textContent = '导出 PDF';
        setFeedback(`导出初始化失败：${error.message}`, 'error');
        return;
      }
      Promise.resolve(result)
        .then((success) => {
          if (success === true) setFeedback('PDF 已打开打印窗口。', 'success');
        })
        .catch((error) => {
          setFeedback(`导出失败：${error.message}`, 'error');
        })
        .finally(() => {
          pdfOption.disabled = false;
          pdfOption.textContent = '导出 PDF';
        });
    });
    actionBar.appendChild(exportMenu);
    controls.appendChild(actionBar);
    workbook.appendChild(controls);
    resultRoot.appendChild(workbook);
  }

  function renderReportView() {
    if (!repository || !reportRepository) return;
    const candidates = reportCandidates();
    const taskId = repository.getState().currentTaskId;
    const record = reportRepository.getReport(taskId);
    if (reportInputTaskId !== taskId) {
      elements.reportGoal.value = record?.goal || '';
      elements.reportConstraints.value = record?.constraints?.join('\n') || '';
      elements.reportPreset.value = record?.reportPresetSelection || 'auto';
      const familiarityLevel = record?.familiarityLevel || 'beginner';
      elements.reportFamiliarity.forEach((input) => {
        input.checked = input.value === familiarityLevel;
      });
      elements.reportSupplement.checked = record?.supplementMode === 'labeled_supplement';
      elements.supplementWarning.hidden = !elements.reportSupplement.checked;
      reportInputTaskId = taskId;
    }
    syncFamiliarityPresentation();
    renderReportMaterialChoices(candidates, record);
    const selected = candidates.filter((material) => selectedReportMaterialIds.has(material.id));
    const reportSelection = new Set(record?.selectedMaterialIds || [...selectedReportMaterialIds]);
    const reportMaterials = candidates.filter((material) => reportSelection.has(material.id));
    const revision = XhsUiModel.createSourceRevision(reportMaterials);
    if (record && record.sourceRevision !== revision) {
      record.status = 'stale';
      if (reportRepository.getReport(taskId)?.status !== 'stale') {
        reportRepository.markStale(taskId, revision).catch(() => undefined);
      }
    }
    renderReportResult(record);
    if (reportError) {
      const notice = document.createElement('p');
      notice.className = 'xmc-report-notice xmc-report-notice--error';
      notice.textContent = `本次没有覆盖旧报告：${reportError}`;
      elements.reportResult.prepend(notice);
      elements.reportStatus.textContent = `生成失败：${reportError}`;
      elements.reportStatus.dataset.tone = 'error';
    }
    elements.generateReport.textContent = reportBusy ? '正在整理手册…' : '生成整理手册';
    updateReportStepAvailability(record);
  }

  function openTutorialManual(manual) {
    if (!manual) return;
    activeManual = manual;
    workbookPageIndex = 0;
    setActiveView('manuals');
    scrollReportToTop();
  }

  async function removeTutorialManual(id) {
    if (!manualRepository) return;
    const manual = manualRepository.get(id);
    if (!manual) return;
    const confirmed = window.confirm?.(`确认删除“${manual.title}”吗？`) ?? true;
    if (!confirmed) return;
    try {
      await manualRepository.remove(id);
      if (activeManual?.id === id) activeManual = null;
      elements.manualStatus.textContent = '手册已删除。';
      elements.manualStatus.dataset.tone = 'success';
      renderManuals();
    } catch (_error) {
      elements.manualStatus.textContent = '手册删除失败，请重试。';
      elements.manualStatus.dataset.tone = 'error';
    }
  }

  function syncFamiliarityPresentation() {
    const presentation = XhsUiModel.getFamiliarityPresentation(elements.reportPreset.value);
    elements.reportFamiliaritySection.hidden = !presentation.tip;
    elements.reportFamiliarityOptions.hidden = !presentation.showOptions;
    elements.familiarityTip.textContent = presentation.tip;
  }

  function showToast(material, message = '已添加到素材箱', tone = 'success') {
    window.clearTimeout(toastTimer);
    elements.toast.hidden = false;
    elements.toast.dataset.tone = tone;
    root.classList.add('xmc-has-toast');
    elements.toastTitle.textContent = message;
    elements.toastDetail.textContent = material.title;
    elements.toastThumb.replaceChildren();
    if (material.coverUrl) {
      const image = document.createElement('img');
      image.src = material.coverUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      elements.toastThumb.appendChild(image);
    } else {
      elements.toastThumb.textContent = '文';
    }
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
      root.classList.remove('xmc-has-toast');
    }, 3600);
  }

  function appendTextElement(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function renderTasks(state) {
    elements.taskSelect.replaceChildren();
    for (const task of state.tasks) {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.name;
      option.selected = task.id === state.currentTaskId;
      elements.taskSelect.appendChild(option);
    }
  }

  function formatCapturedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '时间未知';
    }
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function appendBriefList(parent, label, items) {
    if (!Array.isArray(items) || !items.length) return;
    const section = appendTextElement(parent, 'section', 'xmc-brief__section', '');
    appendTextElement(section, 'strong', 'xmc-brief__label', label);
    const list = document.createElement('ul');
    for (const item of items) {
      const base = typeof item === 'string'
        ? item
        : (item.text || `${item.name} · ${item.kind}`);
      const citations = item && Array.isArray(item.evidenceIds)
        ? ` [${item.evidenceIds.join(', ')}]`
        : '';
      appendTextElement(list, 'li', '', `${base}${citations}`);
    }
    section.appendChild(list);
  }

  function appendEvidence(parent, evidence) {
    if (!Array.isArray(evidence) || !evidence.length) return;
    appendTextElement(parent, 'strong', 'xmc-preview__evidence-title', 'AI 引用的原文片段');
    const list = document.createElement('ol');
    list.className = 'xmc-preview__evidence';
    for (const item of evidence) {
      appendTextElement(list, 'li', '', `${item.id}：${item.quote}`);
    }
    parent.appendChild(list);
  }

  function appendAnalysis(parent, material) {
    const status = XhsUiModel.getAnalysisStatus(material);
    const badge = appendTextElement(parent, 'span', 'xmc-analysis-status', status.label);
    badge.dataset.tone = status.tone;
    if (material.analysisStatus === 'processing') {
      appendTextElement(
        parent,
        'div',
        'xmc-analysis-skeleton',
        '正在整理标题、关键信息和步骤',
      );
    } else if (material.analysisStatus === 'succeeded' && material.contentBrief) {
      const brief = document.createElement('div');
      brief.className = 'xmc-brief';
      const summaryIds = Array.isArray(material.contentBrief.oneLineSummaryEvidenceIds)
        ? material.contentBrief.oneLineSummaryEvidenceIds
        : [];
      const summaryCitations = summaryIds.length ? ` [${summaryIds.join(', ')}]` : '';
      appendTextElement(
        brief,
        'p',
        'xmc-brief__summary',
        `${material.contentBrief.oneLineSummary}${summaryCitations}`,
      );
      appendBriefList(brief, '关键信息', material.contentBrief.keyPoints);
      appendBriefList(brief, '作者观点', material.contentBrief.authorViews);
      appendBriefList(brief, '步骤 / 建议', material.contentBrief.actions);
      appendBriefList(brief, '涉及对象', material.contentBrief.entities);
      appendBriefList(brief, '注意事项', material.contentBrief.warnings);
      appendBriefList(brief, '待确认信息', material.contentBrief.unknowns);
      parent.appendChild(brief);
    } else if (material.analysisError) {
      appendTextElement(parent, 'p', 'xmc-analysis-error', material.analysisError.message);
      if (material.analysisError?.diagnosticId) {
        appendTextElement(
          parent,
          'p',
          'xmc-analysis-diagnostic',
          `诊断编号：${material.analysisError.diagnosticId}`,
        );
      }
    }
  }

  function createMaterialRow(material, taskName) {
    const article = document.createElement('article');
    article.className = 'xmc-material';
    const expanded = XhsUiModel.isMaterialExpanded(expandedMaterialIds, material.id);
    article.dataset.expanded = String(expanded);

    if (material.coverUrl) {
      const image = document.createElement('img');
      image.className = 'xmc-material__cover';
      image.src = material.coverUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      article.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'xmc-material__placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '文';
      article.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'xmc-material__body';
    const heading = document.createElement('div');
    heading.className = 'xmc-material__heading';
    appendTextElement(heading, 'h3', '', material.title);
    const status = XhsUiModel.getMaterialStatus(material);
    const badge = appendTextElement(heading, 'span', 'xmc-status', status.label);
    badge.dataset.tone = status.tone;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'xmc-material__toggle';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? '折叠素材详情' : '展开素材详情');
    toggle.textContent = expanded ? '−' : '＋';
    toggle.addEventListener('click', () => {
      expandedMaterialIds = XhsUiModel.toggleMaterialExpanded(expandedMaterialIds, material.id);
      const nowExpanded = XhsUiModel.isMaterialExpanded(expandedMaterialIds, material.id);
      article.dataset.expanded = String(nowExpanded);
      expandedBody.hidden = !nowExpanded;
      toggle.textContent = nowExpanded ? '−' : '＋';
      toggle.setAttribute('aria-expanded', String(nowExpanded));
      toggle.setAttribute('aria-label', nowExpanded ? '折叠素材详情' : '展开素材详情');
    });
    heading.appendChild(toggle);
    body.appendChild(heading);
    appendTextElement(
      body,
      'p',
      'xmc-material__meta',
      `${taskName} · ${material.author || '未读取作者'} · ${formatCapturedAt(material.capturedAt)}`,
    );
    if (material.analysisStatus === 'succeeded' && material.contentBrief?.oneLineSummary) {
      appendTextElement(body, 'p', 'xmc-material__summary', material.contentBrief.oneLineSummary);
    }

    const expandedBody = document.createElement('div');
    expandedBody.className = 'xmc-material__expanded';
    expandedBody.hidden = !expanded;
    appendAnalysis(expandedBody, material);

    const details = document.createElement('details');
    details.className = 'xmc-preview';
    const summary = document.createElement('summary');
    summary.textContent = '查看原始摘录';
    details.appendChild(summary);
    appendTextElement(
      details,
      'p',
      'xmc-preview__text',
      material.bodyText || '当前页面没有读取到正文。',
    );
    appendTextElement(
      details,
      'p',
      'xmc-preview__missing',
      XhsUiModel.describeMissingFields(material.missingFields),
    );
    appendEvidence(details, material.contentBrief?.evidence);
    expandedBody.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'xmc-material__actions';
    const source = document.createElement('a');
    source.href = material.openUrl || material.sourceUrl;
    source.target = '_blank';
    source.rel = 'noreferrer';
    source.textContent = '打开原文';
    actions.appendChild(source);
    if (XhsUiModel.canManuallyRetryAnalysis(material)) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'xmc-retry-analysis';
      retry.textContent = '重新整理';
      retry.addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'XMC_RETRY_ANALYSIS', materialId: material.id,
          });
          if (!response || !response.ok) throw new Error('后台没有确认重试');
          setFeedback('已重新加入 AI 整理队列。', 'success');
        } catch (error) {
          setFeedback(`重试失败：${error.message}`, 'error');
        }
      });
      actions.appendChild(retry);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '移除';
    remove.addEventListener('click', async () => {
      try {
        await repository.removeMaterial(material.id);
        chrome.runtime.sendMessage({ type: 'XMC_PRUNE_ANALYSIS' }).catch(() => undefined);
        render();
        setFeedback('已从当前任务移除，不影响小红书收藏。', 'success');
      } catch (error) {
        setFeedback(`移除失败：${error.message}`, 'error');
      }
    });
    actions.appendChild(remove);
    expandedBody.appendChild(actions);
    body.appendChild(expandedBody);
    article.appendChild(body);
    return article;
  }

  function renderMaterials(state) {
    const materials = repository.listMaterials(state.currentTaskId);
    const currentTask = state.tasks.find((task) => task.id === state.currentTaskId);
    const taskName = currentTask ? currentTask.name : '当前任务';
    elements.list.replaceChildren();
    if (!materials.length) {
      const empty = document.createElement('div');
      empty.className = 'xmc-empty';
      appendTextElement(empty, 'strong', '', '还没有任务素材');
      appendTextElement(empty, 'p', '', '打开一篇小红书图文笔记，再点击“识别并拾取”。');
      elements.list.appendChild(empty);
    } else {
      materials
        .slice()
        .sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))
        .forEach((material) => elements.list.appendChild(
          createMaterialRow(materialWithAnalysis(material), taskName),
        ));
    }
    elements.count.textContent = String(materials.length);
    elements.count.setAttribute('aria-label', `${materials.length} 条素材`);
    elements.footerCount.textContent = `${materials.length} 条素材`;
    elements.clear.disabled = !materials.length;
    elements.expandAll.disabled = !materials.length;
    elements.collapseAll.disabled = !materials.length;
    const actionableCount = materials.filter((material) => {
      const record = analysisState.records.find((item) => (
        item.materialId === material.id && item.contentHash === material.contentHash
      ));
      return !record
        || ['pending', 'stale'].includes(record.status)
        || (record.status === 'failed' && record.error?.retryable);
    }).length;
    elements.aiActions.hidden = !analysisState.enabled;
    elements.runAiAll.disabled = actionableCount === 0;
    elements.aiActionsHint.textContent = actionableCount
      ? `${actionableCount} 条素材待整理或可重试`
      : '当前任务已全部整理';
  }

  function renderAiConsent() {
    elements.aiConsent.hidden = analysisState.enabled;
  }

  function evaluatePage() {
    if (!repository) {
      return;
    }
    pageResult = XhsAdapter.extractVisibleNote(document, window.location);
    const state = repository.getState();
    const availability = XhsUiModel.getCaptureAvailability(
      pageResult,
      state.materials,
      state.currentTaskId,
    );
    elements.capture.disabled = busy || !availability.canCapture;
    elements.drawerCapture.disabled = busy || !availability.canCapture;
    elements.capture.dataset.state = busy ? 'busy' : availability.state;
    elements.drawerCapture.dataset.state = busy ? 'busy' : availability.state;
    elements.captureLabel.textContent = busy ? '正在读取并保存' : availability.label;
    elements.drawerCaptureLabel.textContent = busy ? '正在读取并保存' : availability.label;
    if (busy) {
      elements.captureHint.textContent = '请稍候';
      elements.drawerCaptureHint.textContent = '请稍候';
    } else if (availability.state === 'partial-ready') {
      elements.captureHint.textContent = '部分字段可能缺失';
      elements.drawerCaptureHint.textContent = '部分字段可能缺失';
    } else if (availability.canCapture) {
      elements.captureHint.textContent = '仅保存当前笔记';
      elements.drawerCaptureHint.textContent = '仅保存当前笔记';
    } else {
      elements.captureHint.textContent = '不会自动保存';
      elements.drawerCaptureHint.textContent = '不会自动保存';
    }
  }

  function render() {
    const state = repository.getState();
    renderTasks(state);
    renderMaterials(state);
    renderAiConsent();
    evaluatePage();
  }

  function scheduleEvaluation() {
    if (evaluationTimer !== null) {
      return;
    }
    evaluationTimer = window.setTimeout(() => {
      evaluationTimer = null;
      evaluatePage();
    }, 250);
  }

  async function captureCurrent(keepDrawerOpen) {
    if (busy) {
      return;
    }
    busy = true;
    evaluatePage();
    try {
      const freshResult = XhsAdapter.extractVisibleNote(document, window.location);
      if (!freshResult.ready) {
        throw new Error(freshResult.reason === 'not-note-page' ? '当前不是图文笔记详情页' : '笔记内容尚未加载完成');
      }
      const result = await repository.capture(freshResult.capture);
      render();
      const status = XhsUiModel.getMaterialStatus(result.material);
      const action = result.action === 'updated' ? '已更新素材' : '已加入素材箱';
      const existingAnalysis = analysisState.records.find(
        (item) => item.materialId === result.material.id,
      );
      const shouldAnalyze = !existingAnalysis
        || existingAnalysis.contentHash !== result.material.contentHash
        || ['pending', 'stale', 'failed'].includes(existingAnalysis.status);
      if (analysisState.enabled && shouldAnalyze) {
        chrome.runtime.sendMessage({
          type: 'XMC_ANALYZE_MATERIAL',
          materialId: result.material.id,
        }).catch(() => undefined);
      }
      const aiMessage = analysisState.enabled && shouldAnalyze
        ? `${action}，AI 正在整理`
        : action;
      setFeedback(`${action}，读取状态：${status.label}。`, result.material.captureStatus === 'complete' ? 'success' : 'warning');
      if (!keepDrawerOpen) {
        showToast(result.material, aiMessage);
      }
    } catch (error) {
      setFeedback(`没有保存：${error.message}`, 'error');
      if (!keepDrawerOpen) {
        showToast({ title: error.message, coverUrl: '' }, '没有保存', 'error');
      }
    } finally {
      busy = false;
      evaluatePage();
    }
  }

  elements.capture.addEventListener('click', () => captureCurrent(false));
  elements.drawerCapture.addEventListener('click', () => captureCurrent(true));

  elements.enableAi.addEventListener('click', async () => {
    try {
      const provider = await chrome.runtime.sendMessage({ type: 'XMC_GET_PROVIDER_SETTINGS' });
      if (provider?.ok && provider.settings?.mode === 'direct' && !provider.settings.ready) {
        openSettings();
        setFeedback('首次使用需要先完成模型配置并测试连接。', 'warning');
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'XMC_ENABLE_AI' });
      if (!response || !response.ok) throw new Error('后台没有确认开启');
      await reloadAnalysisState();
      render();
      chrome.runtime.sendMessage({ type: 'XMC_DRAIN_ANALYSIS_QUEUE' }).catch(() => undefined);
      setFeedback('AI 自动整理已开启，待处理素材会按顺序整理。', 'success');
    } catch (error) {
      setFeedback(`开启失败：${error.message}`, 'error');
    }
  });

  async function runAllAnalysis() {
    const materialIds = repository
      .listMaterials(repository.getState().currentTaskId)
      .map((material) => material.id);
    if (!materialIds.length) return;
    elements.runAiAll.disabled = true;
    elements.runAiAll.textContent = '正在整理…';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'XMC_RETRY_ALL_ANALYSIS', materialIds,
      });
      if (!response?.ok) throw new Error(response?.error || '后台没有确认批量整理');
      await reloadAnalysisState();
      render();
      setFeedback(
        response.processed ? `已完成 ${response.processed} 条 AI 整理。` : '当前没有需要重新整理的素材。',
        'success',
      );
    } catch (error) {
      setFeedback(`一键整理失败：${error.message}`, 'error');
    } finally {
      elements.runAiAll.textContent = 'AI 一键整理';
      renderMaterials(repository.getState());
    }
  }

  elements.runAiAll.addEventListener('click', runAllAnalysis);

  elements.dock.addEventListener('click', () => setDrawer(true));
  elements.close.addEventListener('click', () => setDrawer(false));

  elements.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => setActiveView(tab.dataset.view));
  });

  elements.reportSteps.forEach((button) => {
    button.addEventListener('click', () => {
      const taskId = repository.getState().currentTaskId;
      setReportStep(Number(button.dataset.reportStep), reportRepository.getReport(taskId));
    });
  });
  elements.reportNext.addEventListener('click', () => setReportStep(2));
  elements.reportBack.addEventListener('click', () => setReportStep(1));
  elements.reportGoal.addEventListener('input', () => {
    const taskId = repository.getState().currentTaskId;
    updateReportStepAvailability(reportRepository.getReport(taskId));
  });
  elements.reportSupplement.addEventListener('change', () => {
    elements.supplementWarning.hidden = !elements.reportSupplement.checked;
    elements.reportStatus.textContent = '设置已变化';
  });
  elements.reportPreset.addEventListener('change', () => {
    syncFamiliarityPresentation();
    elements.reportStatus.textContent = '设置已变化';
  });
  elements.reportFamiliarity.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) elements.reportStatus.textContent = '设置已变化';
    });
  });

  elements.settingsToggle.addEventListener('click', openSettings);
  elements.settingsBack.addEventListener('click', () => setActiveView(activeView));
  elements.authSignIn.addEventListener('click', () => runAuthAction('XMC_AUTH_SIGN_IN'));
  elements.authSignOut.addEventListener('click', () => runAuthAction('XMC_AUTH_SIGN_OUT'));
  elements.secretToggle.addEventListener('click', () => {
    const reveal = elements.settingsApiKey.type === 'password';
    elements.settingsApiKey.type = reveal ? 'text' : 'password';
    elements.secretToggle.setAttribute('aria-label', reveal ? '隐藏密钥' : '显示密钥');
  });

  elements.settingsProvider.addEventListener('change', () => {
    const preset = XhsProviderPresets.getProviderPreset(elements.settingsProvider.value);
    if (!preset || preset.id === 'custom') return;
    elements.settingsBaseUrl.value = preset.baseUrl;
    elements.settingsModel.value = preset.model;
    elements.settingsFeedback.textContent = `已填入 ${preset.label} 的建议配置，可继续手动修改。`;
    elements.settingsFeedback.dataset.tone = 'neutral';
  });

  elements.settingsBaseUrl.addEventListener('input', () => {
    elements.settingsProvider.value = XhsProviderPresets.inferProviderId(
      elements.settingsBaseUrl.value,
    );
  });

  elements.settingsMode.addEventListener('change', () => {
    loadSettingsView();
  });

  elements.testSettings.addEventListener('click', async () => {
    elements.testSettings.disabled = true;
    setConnectionState('testing', '测试中');
    elements.settingsFeedback.textContent = '正在连接模型服务…';
    elements.settingsFeedback.dataset.tone = 'neutral';
    try {
      const response = await chrome.runtime.sendMessage({
        type: elements.settingsMode.value === 'direct' ? 'XMC_TEST_PROVIDER_SETTINGS' : 'XMC_TEST_SETTINGS', settings: settingsPayload(),
      });
      if (!response?.ok) throw new Error(response?.error || '连接测试失败');
      await chrome.runtime.sendMessage({ type: 'XMC_MARK_PROVIDER_TESTED', mode: 'direct' });
      if (elements.settingsMode.value === 'direct' && elements.settingsProvider.value === 'custom') {
        try {
          const url = new URL(elements.settingsBaseUrl.value);
          if (chrome.permissions?.request) {
            await chrome.permissions.request({ origins: [`${url.origin}/*`] });
          }
        } catch (_error) {
          elements.settingsFeedback.textContent = '连接成功，但浏览器可能尚未允许该自定义域名；若整理失败，请在扩展权限中允许访问。';
          elements.settingsFeedback.dataset.tone = 'warning';
        }
      }
      setConnectionState('connected', '连接成功');
      elements.settingsFeedback.textContent = '模型已响应，可以保存这组配置。';
      elements.settingsFeedback.dataset.tone = 'success';
    } catch (error) {
      setConnectionState('failed', '连接失败');
      elements.settingsFeedback.textContent = error.message;
      elements.settingsFeedback.dataset.tone = 'error';
    } finally {
      elements.testSettings.disabled = false;
    }
  });

  elements.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.saveSettings.disabled = true;
    elements.settingsFeedback.textContent = '正在保存到本机…';
    try {
      const response = await chrome.runtime.sendMessage({
        type: elements.settingsMode.value === 'direct' ? 'XMC_SAVE_PROVIDER_SETTINGS' : 'XMC_SAVE_SETTINGS', settings: settingsPayload(),
      });
      if (!response?.ok) throw new Error(response?.error || '保存失败');
      setConnectionState('configured', '已配置');
      elements.settingsApiKey.value = '';
      elements.settingsApiKey.placeholder = '已保存，修改时重新输入';
      elements.settingsFeedback.textContent = '设置已保存，重启本地服务后仍然有效。';
      elements.settingsFeedback.dataset.tone = 'success';
    } catch (error) {
      setConnectionState('failed', '保存失败');
      elements.settingsFeedback.textContent = error.message;
      elements.settingsFeedback.dataset.tone = 'error';
    } finally {
      elements.saveSettings.disabled = false;
    }
  });

  elements.expandAll.addEventListener('click', () => {
    expandedMaterialIds = XhsUiModel.expandAllMaterials(
      repository.listMaterials(repository.getState().currentTaskId).map((material) => material.id),
    );
    renderMaterials(repository.getState());
  });

  elements.collapseAll.addEventListener('click', () => {
    expandedMaterialIds = XhsUiModel.collapseAllMaterials();
    renderMaterials(repository.getState());
  });

  elements.generateReport.addEventListener('click', async () => {
    const reportTaskId = repository.getState().currentTaskId;
    const goal = elements.reportGoal.value.trim();
    const constraints = elements.reportConstraints.value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    const candidates = reportCandidates();
    const selected = candidates.filter((material) => selectedReportMaterialIds.has(material.id));
    const reportPresetSelection = elements.reportPreset.value;
    const reportPreset = reportPresetSelection === 'auto' ? null : reportPresetSelection;
    const familiarityLevel = reportPresetSelection === 'tutorial'
      ? (elements.reportFamiliarity.find((input) => input.checked)?.value || 'beginner')
      : 'beginner';
    const supplementMode = elements.reportSupplement.checked ? 'labeled_supplement' : 'source_only';
    if (goal.length < 4) {
      elements.reportStatus.textContent = '请先填写目标';
      elements.reportGoal.focus();
      return;
    }
    if (selected.length < 2) {
      elements.reportStatus.textContent = '至少选择两条素材';
      return;
    }
    reportBusy = true;
    reportError = '';
    renderReportView();
    const sourceRevision = XhsUiModel.createSourceRevision(selected);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'XMC_GENERATE_REPORT',
        goal,
        constraints,
        selectedMaterialIds: selected.map((material) => material.id),
        taskId: reportTaskId,
        sourceRevision,
        reportPreset,
        familiarityLevel,
        supplementMode,
      });
      if (!response?.ok) throw new Error(response?.error || '报告生成失败');
      await reportRepository.saveReport(reportTaskId, {
        ...response.report,
        goal,
        constraints,
        reportPresetSelection,
        familiarityLevel,
        supplementMode,
        selectedMaterialIds: selected.map((material) => material.id),
      });
      reportStep = 3;
      workbookPageIndex = 0;
      elements.reportStatus.textContent = '已生成';
    } catch (error) {
      reportError = error.message;
      elements.reportStatus.textContent = `生成失败：${reportError}`;
      elements.reportStatus.dataset.tone = 'error';
    } finally {
      reportBusy = false;
      renderReportView();
    }
  });

  elements.addTask.addEventListener('click', () => {
    elements.newTask.hidden = !elements.newTask.hidden;
    if (!elements.newTask.hidden) {
      elements.taskName.focus();
    }
  });

  elements.newTask.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const task = await repository.createTask(elements.taskName.value);
      elements.taskName.value = '';
      elements.newTask.hidden = true;
      render();
      setFeedback(`已创建任务“${task.name}”。`, 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    }
  });

  elements.taskSelect.addEventListener('change', async () => {
    try {
      await repository.selectTask(elements.taskSelect.value);
      clearArmedTaskId = '';
      clearArmedUntil = 0;
      selectedReportMaterialIds = new Set();
      reportError = '';
      reportStep = 1;
      workbookPageIndex = 0;
      elements.clear.textContent = '清空当前任务';
      render();
      setFeedback('已切换任务，新的拾取内容会进入当前素材箱。');
    } catch (error) {
      setFeedback(`切换失败：${error.message}`, 'error');
    }
  });

  elements.clear.addEventListener('click', async () => {
    const now = Date.now();
    const currentTaskId = repository.getState().currentTaskId;
    if (XhsUiModel.getClearConfirmation(clearArmedTaskId, clearArmedUntil, currentTaskId, now) === 'arm') {
      clearArmedTaskId = currentTaskId;
      clearArmedUntil = now + 4000;
      elements.clear.textContent = '再次点击确认清空';
      setFeedback('再次点击将清空当前任务素材，不影响小红书收藏。', 'warning');
      const armedTaskId = currentTaskId;
      window.setTimeout(() => {
        if (clearArmedTaskId === armedTaskId && Date.now() >= clearArmedUntil) {
          clearArmedTaskId = '';
          elements.clear.textContent = '清空当前任务';
        }
      }, 4100);
      return;
    }
    try {
      await repository.clearTask(currentTaskId);
      chrome.runtime.sendMessage({ type: 'XMC_PRUNE_ANALYSIS' }).catch(() => undefined);
      clearArmedTaskId = '';
      clearArmedUntil = 0;
      elements.clear.textContent = '清空当前任务';
      render();
      setFeedback('当前任务素材已清空。', 'success');
    } catch (error) {
      setFeedback(`清空失败：${error.message}`, 'error');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('xmc-is-open')) {
      setDrawer(false);
    }
  });

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => !root.contains(mutation.target))) {
      scheduleEvaluation();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      scheduleEvaluation();
    }
  }, 1000);

  async function initialize() {
    try {
      storage = XhsRepository.createChromeStorageAdapter(chrome.storage.local, chrome.runtime);
      const lock = navigator.locks && typeof navigator.locks.request === 'function'
        ? (operation) => navigator.locks.request('xmc-storage-write', operation)
        : undefined;
      repository = XhsRepository.createRepository(storage, { lock });
      reportRepository = XhsReportRepository.createReportRepository(storage);
      manualRepository = XhsTutorialManualRepository.createTutorialManualRepository(storage, { lock });
      await repository.initialize();
      await reportRepository.initialize();
      await manualRepository.initialize();
      await reloadAnalysisState();
      render();
      loadSettingsView();
      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
          if (areaName !== 'local') return;
          try {
            if (changes[XhsRepository.STATE_KEY]) await repository.reload();
            if (changes[XhsAnalysisRepository.ANALYSIS_STATE_KEY]) await reloadAnalysisState();
            if (changes[XhsReportRepository.REPORT_STATE_KEY]) await reportRepository.reload();
            if (changes[XhsTutorialManualRepository.MANUAL_STATE_KEY]) await manualRepository.reload();
            if (changes[XhsRepository.STATE_KEY]
              || changes[XhsAnalysisRepository.ANALYSIS_STATE_KEY]) render();
            if ((changes[XhsRepository.STATE_KEY]
              || changes[XhsAnalysisRepository.ANALYSIS_STATE_KEY]) && activeView === 'report') {
              renderReportView();
            }
            if (changes[XhsReportRepository.REPORT_STATE_KEY] && activeView === 'report') {
              renderReportView();
            }
            if (changes[XhsTutorialManualRepository.MANUAL_STATE_KEY] && activeView === 'manuals') {
              renderManuals();
            }
          } catch (_error) {
            // The next local action will retry from persisted state.
          }
        });
      }
      if (analysisState.enabled) {
        chrome.runtime.sendMessage({ type: 'XMC_DRAIN_ANALYSIS_QUEUE' }).catch(() => undefined);
      }
    } catch (error) {
      elements.capture.disabled = true;
      elements.captureLabel.textContent = '素材助手暂不可用';
      elements.captureHint.textContent = '请重新加载扩展';
      setFeedback(`初始化失败：${error.message}`, 'error');
      setDrawer(true);
    }
  }

  initialize();
}());
