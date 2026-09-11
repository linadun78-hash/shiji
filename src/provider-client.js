(function exposeProviderClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsProviderClient = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createProviderClientApi() {
  function errorForStatus(status) {
    if (status === 401 || status === 403) return ['provider_auth_failed', '模型服务认证失败'];
    if (status === 429) return ['provider_rate_limited', '模型服务额度或频率受限'];
    if (status >= 500) return ['provider_unavailable', '模型服务暂时不可用'];
    if (status === 400 || status === 404 || status === 422) return ['provider_bad_request', '模型服务拒绝了请求参数'];
    return ['provider_request_failed', '模型服务请求失败'];
  }

  function createProviderClient({ fetchFn = fetch, timeoutMs = 30000 } = {}) {
    async function complete({ baseUrl, model, apiKey, messages, signal, timeoutMs: requestTimeoutMs = timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
      try {
        let response;
        try {
          response = await fetchFn(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, max_tokens: 12000 }),
            signal: controller.signal,
          });
        } catch (_error) {
          const error = new Error('无法连接模型服务');
          error.code = 'provider_network_error';
          throw error;
        }
        if (!response.ok) {
          const [code, message] = errorForStatus(response.status);
          const error = new Error(message);
          error.code = code;
          throw error;
        }
        let payload;
        try { payload = await response.json(); } catch (cause) {
          const networkFailure = cause instanceof TypeError;
          const error = new Error(networkFailure ? '无法连接模型服务' : '模型服务返回了无效结果');
          error.code = networkFailure ? 'provider_network_error' : 'provider_invalid_response';
          throw error;
        }
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          const error = new Error('模型服务返回了空结果');
          error.code = 'provider_invalid_response';
          throw error;
        }
        return { content };
      } catch (error) {
        if (controller.signal.aborted) {
          const timeoutError = new Error('模型请求超时，请稍后重试');
          timeoutError.code = 'provider_timeout';
          throw timeoutError;
        }
        throw error;
      } finally { clearTimeout(timer); }
    }
    return { complete };
  }
  return { createProviderClient };
}));
