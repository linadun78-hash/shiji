(function exposeSettingsClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsSettingsClient = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  function toSettingsPayload(values) {
    return {
      baseUrl: String(values.baseUrl || '').trim().replace(/\/$/, ''),
      model: String(values.model || '').trim(),
      apiKey: String(values.apiKey || '').trim(),
    };
  }

  function createError(code, message, retryable = false) {
    return Object.assign(new Error(message), { code, retryable });
  }

  function validateView(payload) {
    if (!payload || typeof payload !== 'object' || 'apiKey' in payload) {
      throw createError('invalid_backend_response', '设置服务返回了不可识别的结果', true);
    }
    if (typeof payload.configured !== 'boolean'
      || typeof payload.baseUrl !== 'string'
      || typeof payload.model !== 'string'
      || typeof payload.hasApiKey !== 'boolean') {
      throw createError('invalid_backend_response', '设置服务返回了不完整的结果', true);
    }
    return payload;
  }

  function createSettingsClient({ baseUrl, fetchFn }) {
    async function request(path, options) {
      let response;
      try {
        response = await fetchFn(`${baseUrl}${path}`, options);
      } catch (_error) {
        throw createError('backend_unreachable', '无法连接本机设置服务', true);
      }
      let payload = {};
      try {
        if (typeof response.text === 'function') {
          payload = JSON.parse(await response.text());
        } else {
          payload = await response.json();
        }
      } catch (_error) {
        const status = Number.isInteger(response.status) ? response.status : 'unknown';
        const contentType = response.headers?.get?.('Content-Type') || 'unknown';
        throw createError(
          'invalid_backend_response',
          `设置服务返回了无效 JSON（HTTP ${status}，${contentType}）`,
          true,
        );
      }
      if (!response.ok) {
        const detail = payload.detail || {};
        throw createError(detail.code || 'backend_error', detail.message || '设置服务暂不可用', Boolean(detail.retryable));
      }
      return payload;
    }

    async function getSettings() {
      try {
        return validateView(await request('/api/v1/settings', { method: 'GET', cache: 'no-store' }));
      } catch (error) {
        if (error.code !== 'invalid_backend_response') throw error;
        return validateView(await request(
          `/api/v1/settings?retry=${Date.now()}`,
          { method: 'GET', cache: 'reload' },
        ));
      }
    }

    async function testSettings(values) {
      const payload = await request('/api/v1/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSettingsPayload(values)),
      });
      if (!payload || payload.status !== 'connected') {
        throw createError('invalid_backend_response', '设置服务没有确认连接成功', true);
      }
      return payload;
    }

    async function saveSettings(values) {
      return validateView(await request('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSettingsPayload(values)),
      }));
    }

    return { getSettings, testSettings, saveSettings };
  }

  return { createSettingsClient, toSettingsPayload };
}));
