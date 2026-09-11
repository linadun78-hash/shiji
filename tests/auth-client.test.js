const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthClient } = require('../src/auth-client');

function createStore(initial = {}) {
  const state = { ...initial };
  return {
    state,
    async get(key) {
      return { [key]: state[key] };
    },
    async set(values) {
      Object.assign(state, values);
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete state[key]);
    },
  };
}

function createCrypto() {
  return {
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
    subtle: {
      async digest() {
        return Uint8Array.from([1, 2, 3, 4]).buffer;
      },
    },
  };
}

function cloudConfig() {
  return {
    mode: 'cloud',
    apiBaseUrl: 'https://api.example.com',
    auth0: {
      domain: 'tenant.auth0.com',
      clientId: 'public-client',
      audience: 'https://api.example.com',
    },
  };
}

test('returns a sanitized signed-out cloud status', async () => {
  const client = createAuthClient({
    config: cloudConfig(),
    identityApi: {},
    sessionStore: createStore(),
    localStore: createStore(),
    fetchFn: async () => { throw new Error('not called'); },
    cryptoApi: createCrypto(),
    now: () => 1_000,
  });

  assert.deepEqual(await client.getStatus(), {
    mode: 'cloud',
    authenticated: false,
    account: null,
  });
});

test('signs in with PKCE and stores tokens outside the returned account status', async () => {
  const sessionStore = createStore();
  const localStore = createStore();
  const calls = [];
  const identityApi = {
    getRedirectURL: (path) => `https://extension.chromiumapp.org/${path}`,
    async launchWebAuthFlow({ url, interactive }) {
      const authorizationUrl = new URL(url);
      calls.push({ type: 'authorize', authorizationUrl, interactive });
      return `${authorizationUrl.searchParams.get('redirect_uri')}?code=auth-code&state=${authorizationUrl.searchParams.get('state')}`;
    },
  };
  const fetchFn = async (url, options = {}) => {
    calls.push({ type: 'fetch', url, options });
    if (url.endsWith('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ sub: 'auth0|1', name: '旅行用户', email: 'user@example.com', picture: 'https://img.example/avatar.png' }),
    };
  };
  const client = createAuthClient({
    config: cloudConfig(),
    identityApi,
    sessionStore,
    localStore,
    fetchFn,
    cryptoApi: createCrypto(),
    now: () => 10_000,
  });

  const status = await client.signIn();

  assert.equal(calls[0].interactive, true);
  assert.equal(calls[0].authorizationUrl.pathname, '/authorize');
  assert.equal(calls[0].authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(calls[0].authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(calls[0].authorizationUrl.searchParams.get('scope'), 'openid profile email offline_access');
  assert.match(calls[1].options.body, /grant_type=authorization_code/);
  assert.match(calls[1].options.body, /code_verifier=/);
  assert.equal(sessionStore.state.xmcAuthSession.accessToken, 'access-token');
  assert.equal(localStore.state.xmcAuthAccount.refreshToken, 'refresh-token');
  assert.deepEqual(status, {
    mode: 'cloud',
    authenticated: true,
    account: {
      id: 'auth0|1',
      name: '旅行用户',
      email: 'user@example.com',
      picture: 'https://img.example/avatar.png',
    },
  });
  assert.equal(JSON.stringify(status).includes('access-token'), false);
  assert.equal(JSON.stringify(status).includes('refresh-token'), false);
});

test('refreshes an expired access token and persists a rotated refresh token', async () => {
  const sessionStore = createStore({
    xmcAuthSession: { accessToken: 'expired-token', expiresAt: 500 },
  });
  const localStore = createStore({
    xmcAuthAccount: {
      refreshToken: 'old-refresh-token',
      profile: { id: 'auth0|1', name: '旅行用户', email: 'user@example.com', picture: '' },
    },
  });
  let refreshBody = '';
  const client = createAuthClient({
    config: cloudConfig(),
    identityApi: {},
    sessionStore,
    localStore,
    fetchFn: async (url, options) => {
      assert.match(url, /\/oauth\/token$/);
      refreshBody = options.body;
      return {
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 1800,
        }),
      };
    },
    cryptoApi: createCrypto(),
    now: () => 1_000_000,
  });

  assert.equal(await client.getAccessToken(), 'new-access-token');
  assert.match(refreshBody, /grant_type=refresh_token/);
  assert.match(refreshBody, /refresh_token=old-refresh-token/);
  assert.equal(localStore.state.xmcAuthAccount.refreshToken, 'new-refresh-token');
});

test('sign out removes both token stores and returns signed-out status', async () => {
  const sessionStore = createStore({ xmcAuthSession: { accessToken: 'token', expiresAt: 2_000 } });
  const localStore = createStore({ xmcAuthAccount: { refreshToken: 'refresh', profile: { id: '1' } } });
  const client = createAuthClient({
    config: cloudConfig(),
    identityApi: {},
    sessionStore,
    localStore,
    fetchFn: async () => { throw new Error('not called'); },
    cryptoApi: createCrypto(),
    now: () => 1_000,
  });

  assert.deepEqual(await client.signOut(), {
    mode: 'cloud',
    authenticated: false,
    account: null,
  });
  assert.equal(sessionStore.state.xmcAuthSession, undefined);
  assert.equal(localStore.state.xmcAuthAccount, undefined);
});
