(function exposeReportClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsReportClient = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const REPORT_PRESETS = new Set(['tutorial', 'travel', 'generic']);
  const FAMILIARITY_LEVELS = new Set(['beginner', 'informed']);
  const SUPPLEMENT_MODES = new Set(['source_only', 'labeled_supplement']);

  function toReportPayload(values) {
    const reportPreset = REPORT_PRESETS.has(values.reportPreset) ? values.reportPreset : null;
    const familiarityLevel = FAMILIARITY_LEVELS.has(values.familiarityLevel)
      ? values.familiarityLevel
      : 'beginner';
    const supplementMode = SUPPLEMENT_MODES.has(values.supplementMode)
      ? values.supplementMode
      : 'source_only';
    return {
      goal: String(values.goal || '').trim(),
      constraints: Array.isArray(values.constraints) ? values.constraints.slice(0, 12) : [],
      selectedMaterials: Array.isArray(values.selectedMaterials) ? values.selectedMaterials : [],
      sourceRevision: String(values.sourceRevision || '').trim(),
      reportPreset,
      familiarityLevel,
      supplementMode,
    };
  }

  function createError(code, message, retryable = false) {
    return Object.assign(new Error(message), { code, retryable });
  }

  function validateReport(payload) {
    if (!payload || typeof payload !== 'object'
      || typeof payload.reportId !== 'string'
      || typeof payload.goalUnderstanding !== 'string'
      || typeof payload.executiveSummary !== 'string'
      || !Array.isArray(payload.citations)
      || !Array.isArray(payload.themes)
      || !Array.isArray(payload.conflicts)
      || !Array.isArray(payload.informationGaps)
      || !Array.isArray(payload.nextActions)
      || !Array.isArray(payload.preflightActions)
      || !Array.isArray(payload.supplements)) {
      throw createError('invalid_backend_response', '报告服务返回了不完整的结果', true);
    }
    return payload;
  }

  function createReportClient({ baseUrl, fetchFn }) {
    async function generate(values) {
      let response;
      try {
        response = await fetchFn(`${baseUrl}/api/v1/purpose-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toReportPayload(values)),
        });
      } catch (_error) {
        throw createError('backend_unreachable', '无法连接报告服务', true);
      }
      let payload = {};
      try { payload = await response.json(); } catch (_error) {
        throw createError('invalid_backend_response', '报告服务返回了无效 JSON', true);
      }
      if (!response.ok) {
        const detail = payload.detail || {};
        throw createError(detail.code || 'backend_error', detail.message || '报告服务暂不可用', Boolean(detail.retryable));
      }
      return validateReport(payload);
    }

    return { generate };
  }

  return { createReportClient, toReportPayload };
}));
