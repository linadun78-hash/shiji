const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsClient, toSettingsPayload } = require('../src/settings-client');


test('settings payload only contains endpoint model and key', () => {
  assert.deepEqual(toSettingsPayload({
    baseUrl: 'https://api.example/v1/',
    model: 'demo',
    apiKey: 'secret',
    cookie: 'never-send',
  }), {
    baseUrl: 'https://api.example/v1',
    model: 'demo',
    apiKey: 'secret',
  });
});


test('settings client never accepts a returned key', async () => {
  const client = createSettingsClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({
      ok: true,
      json: async () => ({ configured: true, baseUrl: 'url', model: 'm', hasApiKey: true, apiKey: 'leak' }),
    }),
  });

  await assert.rejects(client.getSettings(), (error) => error.code === 'invalid_backend_response');
});


test('test and save use distinct methods and endpoints', async () => {
  const calls = [];
  const client = createSettingsClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async (url, options = {}) => {
      calls.push({ url, ...options });
      return {
        ok: true,
        json: async () => (url.endsWith('/test')
          ? { status: 'connected' }
          : { configured: true, baseUrl: 'https://api.example/v1', model: 'demo', hasApiKey: true }),
      };
    },
  });

  const values = { baseUrl: 'https://api.example/v1', model: 'demo', apiKey: 'secret' };
  await client.testSettings(values);
  await client.saveSettings(values);

  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /settings\/test$/);
  assert.equal(calls[1].method, 'PUT');
  assert.match(calls[1].url, /settings$/);
});


test('settings GET retries once without cache after a non-JSON response', async () => {
  const calls = [];
  const responses = [
    {
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      text: async () => 'OK',
    },
    {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        configured: true,
        baseUrl: 'https://api.example/v1',
        model: 'demo',
        hasApiKey: true,
      }),
    },
  ];
  const client = createSettingsClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async (url, options = {}) => {
      calls.push({ url, ...options });
      return responses.shift();
    },
  });

  const settings = await client.getSettings();

  assert.equal(settings.configured, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].cache, 'no-store');
  assert.match(calls[1].url, /retry=/);
  assert.equal(calls[1].cache, 'reload');
});


test('persistent non-JSON settings response reports status and content type', async () => {
  const client = createSettingsClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<html></html>',
    }),
  });

  await assert.rejects(client.getSettings(), (error) => (
    error.code === 'invalid_backend_response'
    && /HTTP 200/.test(error.message)
    && /text\/html/.test(error.message)
  ));
});
