const test = require('node:test');
const assert = require('node:assert/strict');
const { createProviderSettings } = require('../src/provider-settings');

function store() {
  const data = {};
  return {
    async get(key) { return key ? { [key]: data[key] } : { ...data }; },
    async set(values) { Object.assign(data, values); },
    async remove(key) { delete data[key]; },
  };
}

test('keeps direct and local configurations isolated and redacts public settings', async () => {
  const settings = createProviderSettings(store());
  await settings.save({ mode: 'direct', providerId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt', apiKey: 'secret1234' });
  await settings.save({ mode: 'local', providerId: 'local', baseUrl: 'http://127.0.0.1:8765' });
  assert.equal((await settings.get()).mode, 'local');
  assert.equal((await settings.get('direct')).maskedApiKey, '••••1234');
  assert.equal((await settings.get('direct')).apiKey, undefined);
});

test('clears only the selected mode', async () => {
  const settings = createProviderSettings(store());
  await settings.save({ mode: 'direct', providerId: 'custom', baseUrl: 'https://example.com', model: 'm', apiKey: 'key' });
  await settings.save({ mode: 'local', providerId: 'local', baseUrl: 'http://127.0.0.1:8765' });
  await settings.clear('direct');
  assert.equal((await settings.get('direct')).hasApiKey, false);
  assert.equal((await settings.get('local')).baseUrl, 'http://127.0.0.1:8765');
});

test('tracks a successful connection test separately from saved configuration', async () => {
  const settings = createProviderSettings(store());
  await settings.save({ mode: 'direct', providerId: 'custom', baseUrl: 'https://example.com', model: 'm', apiKey: 'key' });
  assert.equal((await settings.get()).ready, false);
  await settings.markTested('direct');
  assert.equal((await settings.get()).ready, true);
  await settings.save({ mode: 'direct', providerId: 'custom', baseUrl: 'https://example.com', model: 'm2', apiKey: 'key' });
  assert.equal((await settings.get()).ready, false);
});

test('reports direct mode readiness only after a tested saved configuration', async () => {
  const settings = createProviderSettings(store());
  assert.equal((await settings.get('direct')).ready, false);
  await settings.save({ mode: 'direct', providerId: 'custom', baseUrl: 'https://example.com', model: 'm', apiKey: 'key' });
  assert.equal((await settings.get('direct')).ready, false);
  await settings.markTested('direct');
  assert.equal((await settings.get('direct')).ready, true);
});

test('preserves a saved API key when the edit form leaves the key blank', async () => {
  const settings = createProviderSettings(store());
  await settings.save({ mode: 'direct', providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'saved-key' });
  await settings.save({ mode: 'direct', providerId: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: '' });
  assert.equal((await settings.getSecret('direct')).apiKey, 'saved-key');
});
