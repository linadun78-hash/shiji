(function exposeProviderSettings(root, factory) {
  const api = factory(root.XhsProviderConfig);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsProviderSettings = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createProviderSettingsApi(configApi) {
  const KEY = 'xmcProviderSettingsV1';
  const normalize = configApi?.normalizeProviderConfig || ((input = {}) => ({
    providerId: String(input.providerId || '').trim(),
    baseUrl: String(input.baseUrl || '').trim().replace(/\/+$/, ''),
    model: String(input.model || '').trim(),
    apiKey: String(input.apiKey || '').trim(),
    mode: input.mode === 'local' ? 'local' : 'direct',
  }));
  const redact = configApi?.redactProviderConfig || ((input) => ({
    providerId: input.providerId, baseUrl: input.baseUrl, model: input.model, mode: input.mode,
    hasApiKey: Boolean(input.apiKey), maskedApiKey: input.apiKey ? `••••${input.apiKey.slice(-4)}` : '',
  }));

  function createProviderSettings(storage) {
    let state = { activeMode: 'direct', direct: {}, local: {} };
    async function load() {
      const result = await storage.get(KEY);
      const saved = result?.[KEY];
      if (saved && typeof saved === 'object') state = {
        activeMode: saved.activeMode === 'local' ? 'local' : 'direct',
        direct: saved.direct && typeof saved.direct === 'object' ? saved.direct : {},
        local: saved.local && typeof saved.local === 'object' ? saved.local : {},
      };
      return state;
    }
    async function persist() { await storage.set({ [KEY]: state }); }
    async function save(input) {
      const config = normalize(input);
      const mode = config.mode === 'local' ? 'local' : 'direct';
      if (mode === 'direct' && !config.apiKey && state[mode]?.apiKey) config.apiKey = state[mode].apiKey;
      state[mode] = config;
      state[mode].tested = false;
      state.activeMode = mode;
      await persist();
      return { ...redact(config), ready: Boolean(config.tested) };
    }
    async function get(mode = state.activeMode) {
      const config = state[mode] || {};
      return { ...redact(config), ready: Boolean(config.tested) };
    }
    async function getSecret(mode = state.activeMode) { return { ...state[mode] }; }
    async function markTested(mode = state.activeMode) { if (state[mode]) state[mode].tested = true; await persist(); }
    async function clear(mode = state.activeMode) { state[mode] = {}; await persist(); }
    return { load, save, get, getSecret, clear, markTested };
  }
  return { createProviderSettings, KEY };
}));
