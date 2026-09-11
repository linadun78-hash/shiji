(function exposeAnalysisClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsAnalysisClient = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  function toAnalysisPayload(material) {
    return {
      materialId: material.id,
      title: material.title || '',
      author: material.author || '',
      bodyText: material.bodyText || '',
      sourceUrl: material.sourceUrl,
      capturedAt: material.capturedAt,
      contentHash: material.contentHash,
    };
  }

  function createError(code, message, retryable, diagnosticId = '') {
    return Object.assign(new Error(message), {
      code, retryable, diagnosticId,
    });
  }

  function createAnalysisClient({ baseUrl, fetchFn }) {
    async function summarize(material) {
      let response;
      try {
        response = await fetchFn(`${baseUrl}/api/v1/material-briefs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toAnalysisPayload(material)),
        });
      } catch (_error) {
        throw createError('backend_unreachable', '无法连接整理服务', true);
      }
      let payload;
      try {
        payload = await response.json();
      } catch (_error) {
        if (response.ok) {
          throw createError('invalid_backend_response', '整理服务返回了无法识别的结果', true);
        }
        payload = {};
      }
      if (!response.ok) {
        const detail = payload.detail || {};
        throw createError(
          detail.code || 'backend_error',
          detail.message || '整理服务暂不可用',
          Boolean(detail.retryable),
          typeof detail.diagnosticId === 'string' ? detail.diagnosticId : '',
        );
      }
      if (!payload || !['succeeded', 'insufficient'].includes(payload.status)) {
        throw createError('invalid_backend_response', '整理服务返回了无法识别的结果', true);
      }
      if (payload.status === 'succeeded') {
        if (!payload.brief || typeof payload.brief !== 'object'
          || payload.brief.materialId !== material.id
          || payload.brief.contentHash !== material.contentHash) {
          throw createError('invalid_backend_response', '整理结果与当前素材不匹配', true);
        }
      } else if (typeof payload.message !== 'string' || !payload.message.trim()) {
        throw createError('invalid_backend_response', '整理服务未说明原文不足原因', true);
      }
      return payload;
    }

    return { summarize };
  }

  return { createAnalysisClient, toAnalysisPayload };
}));
