(function exposeRuntimeConfig(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsRuntimeConfig = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRuntimeConfig(root) {
  const DEFAULT_CONFIG = Object.freeze({
    mode: 'local',
    apiBaseUrl: 'http://127.0.0.1:8765',
    auth0: Object.freeze({
      domain: '',
      clientId: '',
      audience: '',
    }),
  });

  const SECRET_KEY_PATTERN = /(secret|api.?key|password|private.?key)/i;

  function assertNoSecrets(value, path = 'config') {
    if (!value || typeof value !== 'object') {
      return;
    }
    Object.entries(value).forEach(([key, child]) => {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Public runtime config must not contain secret field: ${path}.${key}`);
      }
      assertNoSecrets(child, `${path}.${key}`);
    });
  }

  function trimTrailingSlash(value) {
    return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  }

  function normalizeDomain(value) {
    return trimTrailingSlash(value).replace(/^https?:\/\//i, '');
  }

  function normalizeConfig(overrides = {}) {
    assertNoSecrets(overrides);
    const auth0 = overrides.auth0 || {};
    return {
      mode: typeof overrides.mode === 'string' ? overrides.mode.trim().toLowerCase() : DEFAULT_CONFIG.mode,
      apiBaseUrl: trimTrailingSlash(overrides.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
      auth0: {
        domain: normalizeDomain(auth0.domain || DEFAULT_CONFIG.auth0.domain),
        clientId: typeof auth0.clientId === 'string' ? auth0.clientId.trim() : DEFAULT_CONFIG.auth0.clientId,
        audience: typeof auth0.audience === 'string' ? auth0.audience.trim() : DEFAULT_CONFIG.auth0.audience,
      },
    };
  }

  function validateConfig(config) {
    if (!['local', 'cloud'].includes(config.mode)) {
      throw new Error('Runtime mode must be local or cloud');
    }
    if (!config.apiBaseUrl) {
      throw new Error('apiBaseUrl is required');
    }
    if (config.mode !== 'cloud') {
      return config;
    }
    if (!config.apiBaseUrl.startsWith('https://')) {
      throw new Error('Cloud apiBaseUrl must use HTTPS');
    }
    ['domain', 'clientId', 'audience'].forEach((field) => {
      if (!config.auth0[field]) {
        throw new Error(`Cloud Auth0 ${field} is required`);
      }
    });
    return config;
  }

  function getRuntimeConfig(overrides) {
    const source = overrides === undefined ? (root.XMC_RUNTIME_CONFIG || {}) : overrides;
    return validateConfig(normalizeConfig(source));
  }

  return {
    getRuntimeConfig,
  };
}));
