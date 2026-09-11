(function exposeAuthClient(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsAuthClient = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAuthApi(root) {
  const SESSION_KEY = 'xmcAuthSession';
  const ACCOUNT_KEY = 'xmcAuthAccount';
  const EXPIRY_LEEWAY_MS = 60_000;

  function createError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function base64Url(bytes) {
    let encoded;
    if (typeof root.btoa === 'function') {
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      encoded = root.btoa(binary);
    } else {
      encoded = Buffer.from(bytes).toString('base64');
    }
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function sanitizeProfile(profile) {
    if (!profile || typeof profile !== 'object' || typeof profile.sub !== 'string') {
      throw createError('invalid_user_profile', '登录服务没有返回有效账号信息');
    }
    return {
      id: profile.sub,
      name: typeof profile.name === 'string' ? profile.name : '',
      email: typeof profile.email === 'string' ? profile.email : '',
      picture: typeof profile.picture === 'string' ? profile.picture : '',
    };
  }

  async function readStore(store, key) {
    const result = await store.get(key);
    return result && result[key] ? result[key] : null;
  }

  async function parseResponse(response, fallbackMessage) {
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw createError('invalid_auth_response', fallbackMessage);
    }
    if (!response.ok) {
      throw createError('auth_request_failed', payload.error_description || payload.error || fallbackMessage);
    }
    return payload;
  }

  function createAuthClient({
    config,
    identityApi,
    sessionStore,
    localStore,
    fetchFn,
    cryptoApi,
    now = Date.now,
  }) {
    let refreshPromise = null;

    function assertCloudMode() {
      if (!config || config.mode !== 'cloud') {
        throw createError('cloud_auth_disabled', '当前使用本地模式，无需登录');
      }
    }

    function authBaseUrl() {
      return `https://${config.auth0.domain}`;
    }

    async function randomValue(size) {
      const bytes = new Uint8Array(size);
      cryptoApi.getRandomValues(bytes);
      return base64Url(bytes);
    }

    async function createCodeChallenge(verifier) {
      const Encoder = root.TextEncoder || TextEncoder;
      const digest = await cryptoApi.subtle.digest('SHA-256', new Encoder().encode(verifier));
      return base64Url(new Uint8Array(digest));
    }

    async function tokenRequest(values) {
      const response = await fetchFn(`${authBaseUrl()}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(values).toString(),
      });
      const payload = await parseResponse(response, '登录令牌请求失败');
      if (typeof payload.access_token !== 'string' || !payload.access_token) {
        throw createError('invalid_auth_response', '登录服务没有返回访问令牌');
      }
      return payload;
    }

    async function saveSession(tokenPayload, previousRefreshToken, profile) {
      const expiresIn = Number.isFinite(Number(tokenPayload.expires_in))
        ? Math.max(1, Number(tokenPayload.expires_in))
        : 3600;
      await sessionStore.set({
        [SESSION_KEY]: {
          accessToken: tokenPayload.access_token,
          expiresAt: now() + (expiresIn * 1000),
        },
      });
      const refreshToken = tokenPayload.refresh_token || previousRefreshToken || '';
      await localStore.set({
        [ACCOUNT_KEY]: {
          refreshToken,
          profile,
        },
      });
    }

    async function getStatus() {
      if (!config || config.mode !== 'cloud') {
        return { mode: 'local', authenticated: false, account: null };
      }
      const account = await readStore(localStore, ACCOUNT_KEY);
      const authenticated = Boolean(account && account.refreshToken && account.profile);
      return {
        mode: 'cloud',
        authenticated,
        account: authenticated ? { ...account.profile } : null,
      };
    }

    async function signIn() {
      assertCloudMode();
      const redirectUri = identityApi.getRedirectURL('auth0');
      const state = await randomValue(24);
      const verifier = await randomValue(32);
      const challenge = await createCodeChallenge(verifier);
      const authorizationUrl = new URL(`${authBaseUrl()}/authorize`);
      authorizationUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: config.auth0.clientId,
        redirect_uri: redirectUri,
        scope: 'openid profile email offline_access',
        audience: config.auth0.audience,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();

      const redirectResult = await identityApi.launchWebAuthFlow({
        url: authorizationUrl.toString(),
        interactive: true,
      });
      const resultUrl = new URL(redirectResult);
      if (resultUrl.searchParams.get('state') !== state) {
        throw createError('invalid_auth_state', '登录状态校验失败，请重试');
      }
      const code = resultUrl.searchParams.get('code');
      if (!code) {
        throw createError('missing_auth_code', '登录未返回授权码');
      }
      const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: config.auth0.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
      });
      const userResponse = await fetchFn(`${authBaseUrl()}/userinfo`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = sanitizeProfile(await parseResponse(userResponse, '无法读取账号信息'));
      await saveSession(tokens, '', profile);
      return getStatus();
    }

    async function refreshAccessToken() {
      const account = await readStore(localStore, ACCOUNT_KEY);
      if (!account || !account.refreshToken || !account.profile) {
        throw createError('auth_required', '请先登录账号');
      }
      const tokens = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: config.auth0.clientId,
        refresh_token: account.refreshToken,
      });
      await saveSession(tokens, account.refreshToken, account.profile);
      return tokens.access_token;
    }

    async function getAccessToken() {
      assertCloudMode();
      const session = await readStore(sessionStore, SESSION_KEY);
      if (session && session.accessToken && session.expiresAt > now() + EXPIRY_LEEWAY_MS) {
        return session.accessToken;
      }
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      return refreshPromise;
    }

    async function signOut() {
      await Promise.all([
        sessionStore.remove(SESSION_KEY),
        localStore.remove(ACCOUNT_KEY),
      ]);
      return getStatus();
    }

    return {
      getAccessToken,
      getStatus,
      signIn,
      signOut,
    };
  }

  return {
    createAuthClient,
  };
}));
