(function exposeProviderConfig(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsProviderConfig = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createProviderConfig() {
  function normalizeProviderConfig(input = {}) {
    const mode = input.mode === 'local' ? 'local' : 'direct';
    return {
      providerId: String(input.providerId || (mode === 'local' ? 'local' : 'custom')).trim(),
      baseUrl: String(input.baseUrl || '').trim().replace(/\/+$/, ''),
      model: String(input.model || '').trim(),
      apiKey: String(input.apiKey || '').trim(),
      mode,
    };
  }

  function validateProviderConfig(input) {
    const config = normalizeProviderConfig(input);
    if (!config.baseUrl) return '请填写模型服务地址';
    if (!config.model && config.mode !== 'local') return '请填写模型名称';
    if (!config.apiKey && config.mode !== 'local') return '请填写 API Key';
    let url;
    try { url = new URL(config.baseUrl); } catch (_error) { return '模型服务地址格式无效'; }
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (config.mode === 'local') {
      if (!loopback || url.protocol !== 'http:') return '本地模式只允许使用本机 HTTP 服务';
    } else if (url.protocol !== 'https:') {
      return '自定义模型服务地址必须使用 HTTPS';
    }
    return null;
  }

  function redactProviderConfig(input) {
    const config = normalizeProviderConfig(input);
    const key = config.apiKey;
    return {
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      model: config.model,
      mode: config.mode,
      hasApiKey: Boolean(key),
      maskedApiKey: key ? `••••${key.slice(-4)}` : '',
    };
  }

  return { normalizeProviderConfig, validateProviderConfig, redactProviderConfig };
}));
