(function exposeUiModelApi(root, factory) {
  const materialApi = typeof module === 'object' && module.exports
    ? require('./material.js')
    : root.XhsMaterial;
  const api = factory(materialApi);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsUiModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createUiModelApi(materialApi) {
  const FIELD_LABELS = {
    author: '作者',
    bodyText: '正文',
    coverUrl: '封面',
  };

  function describeMissingFields(fields) {
    if (!Array.isArray(fields) || !fields.length) {
      return '字段完整';
    }
    const labels = fields.map((field) => FIELD_LABELS[field] || field);
    return `缺少${labels.join('、')}`;
  }

  function getMaterialStatus(material) {
    if (material.captureStatus === 'complete') {
      return { label: '完整文本', tone: 'success' };
    }
    const missing = Array.isArray(material.missingFields) ? material.missingFields : [];
    if (missing.includes('bodyText') && missing.length >= 3) {
      return { label: '仅基础信息', tone: 'warning' };
    }
    return { label: '部分信息', tone: 'warning' };
  }

  function getAnalysisStatus(material) {
    const states = {
      disabled: { label: '开启 AI 后整理', tone: 'neutral' },
      pending: { label: '等待 AI 整理', tone: 'neutral' },
      processing: { label: 'AI 整理中', tone: 'progress' },
      succeeded: { label: '已整理', tone: 'success' },
      insufficient: { label: '原文不足', tone: 'warning' },
      failed: { label: '整理失败', tone: 'error' },
      stale: { label: '等待重新整理', tone: 'warning' },
    };
    return states[material.analysisStatus] || states.pending;
  }

  function canManuallyRetryAnalysis(material) {
    return ['failed', 'succeeded'].includes(material?.analysisStatus);
  }

  function getBriefView(brief) {
    return {
      ...brief,
      oneLineSummary: typeof brief.oneLineSummary === 'string' ? brief.oneLineSummary
        : (typeof brief.summary === 'string' ? brief.summary : '摘要暂不可用'),
      keyPoints: Array.isArray(brief.keyPoints) ? brief.keyPoints : (Array.isArray(brief.facts) ? brief.facts : []),
      warnings: Array.isArray(brief.warnings) ? brief.warnings : (Array.isArray(brief.risks) ? brief.risks : []),
    };
  }

  function getFamiliarityPresentation(reportPreset) {
    if (reportPreset === 'tutorial') {
      return {
        showOptions: true,
        tip: '熟悉程度只影响教程操作说明的详细程度，不改变素材事实。',
      };
    }
    if (reportPreset === 'auto') {
      return {
        showOptions: false,
        tip: '自动识别为教程时，将按“零基础”说明。',
      };
    }
    return { showOptions: false, tip: '' };
  }

  function getClearConfirmation(armedTaskId, armedUntil, currentTaskId, now) {
    return armedTaskId === currentTaskId && now <= armedUntil ? 'confirm' : 'arm';
  }

  function isMaterialExpanded(expandedIds, materialId) {
    return expandedIds instanceof Set && expandedIds.has(materialId);
  }

  function toggleMaterialExpanded(expandedIds, materialId) {
    const next = new Set(expandedIds || []);
    if (next.has(materialId)) next.delete(materialId);
    else next.add(materialId);
    return next;
  }

  function expandAllMaterials(materialIds) {
    return new Set(Array.isArray(materialIds) ? materialIds : []);
  }

  function collapseAllMaterials() {
    return new Set();
  }

  function getReportCandidateIds(materials, records) {
    const analysis = Array.isArray(records) ? records : [];
    return (Array.isArray(materials) ? materials : [])
      .filter((material) => analysis.some((record) => (
        record.materialId === material.id
        && record.contentHash === material.contentHash
        && record.status === 'succeeded'
        && record.brief
      )))
      .map((material) => material.id);
  }

  function createSourceRevision(materials) {
    const source = (Array.isArray(materials) ? materials : [])
      .map((material) => `${material.id}:${material.contentHash}`)
      .sort()
      .join('|');
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `rev-ui-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function restoreReportSelection(candidates, currentSelection, report) {
    const valid = new Set((Array.isArray(candidates) ? candidates : []).map((item) => item.id));
    const current = [...(currentSelection || [])].filter((id) => valid.has(id));
    if (current.length) return new Set(current);
    const saved = report && Array.isArray(report.selectedMaterialIds)
      ? report.selectedMaterialIds.filter((id) => valid.has(id))
      : [];
    if (saved.length) return new Set(saved);
    return new Set(valid);
  }

  function resolveReportCitation(citation, materials, records) {
    const material = (Array.isArray(materials) ? materials : [])
      .find((item) => item.id === citation.materialId);
    const record = (Array.isArray(records) ? records : [])
      .find((item) => item.materialId === citation.materialId && item.status === 'succeeded');
    const evidence = record?.brief?.evidence || [];
    const quotes = (Array.isArray(citation.evidenceIds) ? citation.evidenceIds : [])
      .map((id) => evidence.find((item) => item.id === id)?.quote)
      .filter(Boolean);
    return {
      materialTitle: material?.title || citation.materialId,
      quotes,
    };
  }

  function clampReportStep(step) {
    const value = Number.isFinite(Number(step)) ? Math.round(Number(step)) : 1;
    return Math.min(3, Math.max(1, value));
  }

  function canAdvanceReportStep(step, context = {}) {
    const selectedCount = Number(context.selectedCount) || 0;
    if (clampReportStep(step) === 1) return selectedCount >= 2;
    if (clampReportStep(step) === 2) {
      return selectedCount >= 2 && String(context.goal || '').trim().length >= 4;
    }
    return Boolean(context.hasReport);
  }

  const TRAVEL_TERMS = ['旅游', '旅行', '行程', '景点', '一日游'];
  const TRAVEL_CONTEXT_TERMS = [
    '周末', '出发', '目的地', '酒店', '住宿', '门票', '交通',
    '景区', '打卡', '美食', '餐饮', '游玩',
  ];
  const NON_TRAVEL_PATTERNS = [
    /(?:旅行|旅游)(?:行业|从业|求职|招聘|岗位|工作|市场|产品|业务)/,
    /旅行社(?:求职|招聘|岗位|工作|业务)/,
    /\btravel\s+(?:industry|career|job|market|product|business|research)\b/i,
  ];
  const TUTORIAL_TERMS = [
    '教程', '教学', '学习', '入门', '安装', '配置', '部署', '环境变量',
    '操作步骤', '使用方法', '怎么用', '软件', '应用',
  ];

  function inferWorkbookPreset(goal) {
    const normalized = String(goal || '').trim().toLowerCase();
    if (NON_TRAVEL_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return TUTORIAL_TERMS.some((term) => normalized.includes(term)) ? 'tutorial' : 'generic';
    }
    if (TRAVEL_TERMS.some((term) => normalized.includes(term))) return 'travel';
    if (/\b(?:citywalk|travel|itinerary|trip)\b/i.test(normalized)) return 'travel';
    const hasWeakTravelTerm = /(?:攻略|路线)/.test(normalized) || /\broute\b/i.test(normalized);
    const hasDuration = /(?:\d+|一|二|两|三|四|五|六|七)天(?:\d+|一|二|两|三|四|五|六|七)?夜?/.test(normalized);
    const hasTravelContext = TRAVEL_CONTEXT_TERMS.some((term) => normalized.includes(term))
      || /\b(?:weekend|destination|hotel|ticket|transport|restaurant|sightseeing)\b/i.test(normalized);
    if (hasWeakTravelTerm && (hasDuration || hasTravelContext)) return 'travel';
    return TUTORIAL_TERMS.some((term) => normalized.includes(term)) ? 'tutorial' : 'generic';
  }

  function getReportPreset(report) {
    if (['tutorial', 'travel', 'generic'].includes(report.reportPreset)) {
      return report.reportPreset;
    }
    return inferWorkbookPreset(report.goal || report.goalUnderstanding);
  }

  function getReportItems(value) {
    return Array.isArray(value) ? value : [];
  }

  function hasBudgetSignal(item) {
    const text = String(item?.text || item || '');
    return /(?:预算|费用|价格|金额|票价|人均|消费|[¥￥]|RMB|CNY|\d+(?:\.\d+)?\s*元)/i.test(text);
  }

  function getBudgetItems(report) {
    const seen = new Set();
    return [...getReportItems(report.themes), ...getReportItems(report.nextActions)]
      .filter((item) => getReportItems(item?.citationIds).length > 0)
      .filter(hasBudgetSignal)
      .filter((item) => {
        const key = `${String(item?.text || item)}|${getReportItems(item?.citationIds).join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function buildTravelWorkbookPages(report, sources) {
    const constraints = getReportItems(report.constraints);
    const gaps = getReportItems(report.informationGaps);
    return [
      {
        kind: 'travel-cover',
        title: report.goalUnderstanding || report.goal || '',
        summary: report.executiveSummary || '',
        materials: sources,
        constraints,
      },
      {
        kind: 'travel-itinerary',
        items: getReportItems(report.nextActions),
      },
      {
        kind: 'travel-rationale',
        items: getReportItems(report.themes),
      },
      {
        kind: 'travel-preparation',
        budgetItems: getBudgetItems(report),
        checklist: gaps,
        constraints,
      },
      {
        kind: 'travel-verify',
        conflicts: getReportItems(report.conflicts),
        gaps,
        checklist: gaps,
        citations: getReportItems(report.citations),
        supplements: getReportItems(report.supplements),
      },
    ];
  }

  function buildTutorialWorkbookPages(report, sources) {
    const gaps = getReportItems(report.informationGaps);
    return [
      {
        kind: 'tutorial-start',
        title: report.goalUnderstanding || report.goal || '',
        summary: report.executiveSummary || '',
        items: getReportItems(report.preflightActions),
      },
      {
        kind: 'tutorial-overview',
        summary: report.executiveSummary || '',
        items: getReportItems(report.themes),
        materials: sources,
      },
      {
        kind: 'tutorial-steps',
        items: getReportItems(report.nextActions),
      },
      {
        kind: 'tutorial-verify',
        conflicts: getReportItems(report.conflicts),
        gaps,
        supplements: getReportItems(report.supplements),
      },
      {
        kind: 'tutorial-sources',
        citations: getReportItems(report.citations),
      },
    ];
  }

  function buildWorkbookPages(report, materials) {
    if (!report) return [];
    const sources = Array.isArray(materials) ? materials : [];
    if (getReportPreset(report) === 'travel') {
      return buildTravelWorkbookPages(report, sources);
    }
    if (getReportPreset(report) === 'tutorial') {
      return buildTutorialWorkbookPages(report, sources);
    }
    return [
      {
        kind: 'cover',
        title: report.goalUnderstanding || '',
        summary: report.executiveSummary || '',
        materials: sources,
      },
      {
        kind: 'overview',
        summary: report.executiveSummary || '',
        items: Array.isArray(report.themes) ? report.themes : [],
        materials: sources,
      },
      {
        kind: 'timeline',
        items: Array.isArray(report.nextActions) ? report.nextActions : [],
      },
      {
        kind: 'risks',
        conflicts: Array.isArray(report.conflicts) ? report.conflicts : [],
        gaps: Array.isArray(report.informationGaps) ? report.informationGaps : [],
        supplements: Array.isArray(report.supplements) ? report.supplements : [],
      },
      {
        kind: 'sources',
        citations: Array.isArray(report.citations) ? report.citations : [],
      },
    ];
  }

  function getCaptureAvailability(adapterResult, materials, taskId) {
    if (!adapterResult || !adapterResult.ready) {
      const state = adapterResult && adapterResult.reason ? adapterResult.reason : 'note-not-ready';
      const labels = {
        'not-note-page': '打开图文笔记后可拾取',
        'video-unsupported': '当前版本暂不支持视频',
      };
      return {
        canCapture: false,
        label: labels[state] || '等待笔记加载',
        state,
      };
    }

    const signature = materialApi.getSourceKey(adapterResult.capture.sourceUrl);
    const alreadyCaptured = (materials || []).some((item) => (
      item.taskId === taskId && item.pageSignature === signature
    ));
    if (alreadyCaptured) {
      return { canCapture: true, label: '更新素材', state: 'already-captured' };
    }
    const missing = adapterResult.capture.missingFields || [];
    return {
      canCapture: true,
      label: '识别并拾取',
      state: missing.length ? 'partial-ready' : 'ready',
    };
  }

  return {
    buildWorkbookPages,
    canManuallyRetryAnalysis,
    canAdvanceReportStep,
    clampReportStep,
    collapseAllMaterials,
    createSourceRevision,
    describeMissingFields,
    expandAllMaterials,
    getAnalysisStatus,
    getBriefView,
    getCaptureAvailability,
    getClearConfirmation,
    getFamiliarityPresentation,
    getMaterialStatus,
    getReportCandidateIds,
    getReportPreset,
    inferWorkbookPreset,
    isMaterialExpanded,
    resolveReportCitation,
    restoreReportSelection,
    toggleMaterialExpanded,
  };
}));
