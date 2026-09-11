const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeConfig = require('../src/runtime-config');

test('defaults to the existing local backend without Auth0', () => {
  assert.deepEqual(runtimeConfig.getRuntimeConfig(), {
    mode: 'local',
    apiBaseUrl: 'http://127.0.0.1:8765',
    auth0: {
      domain: '',
      clientId: '',
      audience: '',
    },
  });
});

test('normalizes a complete cloud configuration', () => {
  assert.deepEqual(runtimeConfig.getRuntimeConfig({
    mode: 'cloud',
    apiBaseUrl: 'https://api.example.com/',
    auth0: {
      domain: 'https://example.cn.auth0.com/',
      clientId: 'public-client-id',
      audience: 'https://api.example.com/',
    },
  }), {
    mode: 'cloud',
    apiBaseUrl: 'https://api.example.com',
    auth0: {
      domain: 'example.cn.auth0.com',
      clientId: 'public-client-id',
      audience: 'https://api.example.com/',
    },
  });
});

test('requires HTTPS and complete Auth0 fields in cloud mode', () => {
  assert.throws(() => runtimeConfig.getRuntimeConfig({
    mode: 'cloud',
    apiBaseUrl: 'http://api.example.com',
    auth0: {
      domain: 'example.auth0.com',
      clientId: 'public-client-id',
      audience: 'https://api.example.com',
    },
  }), /HTTPS/);

  assert.throws(() => runtimeConfig.getRuntimeConfig({
    mode: 'cloud',
    apiBaseUrl: 'https://api.example.com',
    auth0: {
      domain: 'example.auth0.com',
      clientId: '',
      audience: 'https://api.example.com',
    },
  }), /clientId/);
});

test('rejects secret material in public runtime configuration', () => {
  assert.throws(() => runtimeConfig.getRuntimeConfig({
    clientSecret: 'must-not-ship',
  }), /secret/i);

  assert.throws(() => runtimeConfig.getRuntimeConfig({
    auth0: {
      domain: 'example.auth0.com',
      clientId: 'public-client-id',
      audience: 'https://api.example.com',
      apiKey: 'must-not-ship',
    },
  }), /secret/i);
});
