const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeProviderConfig,
  validateProviderConfig,
  redactProviderConfig,
} = require('../src/provider-config');

test('normalizes a preset configuration without changing its provider identity', () => {
  assert.deepEqual(normalizeProviderConfig({
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com/',
    model: 'deepseek-chat',
    apiKey: '  secret  ',
    mode: 'direct',
  }), {
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: 'secret',
    mode: 'direct',
  });
});

test('allows only HTTPS custom endpoints and loopback for local mode', () => {
  assert.equal(validateProviderConfig({ providerId: 'custom', baseUrl: 'https://example.com/v1', model: 'm', apiKey: 'k', mode: 'direct' }), null);
  assert.match(validateProviderConfig({ providerId: 'custom', baseUrl: 'http://example.com/v1', model: 'm', apiKey: 'k', mode: 'direct' }), /HTTPS/);
  assert.equal(validateProviderConfig({ providerId: 'local', baseUrl: 'http://127.0.0.1:8765', model: '', apiKey: '', mode: 'local' }), null);
});

test('redacts keys from public settings and preserves only a masked suffix', () => {
  assert.deepEqual(redactProviderConfig({ providerId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt', apiKey: 'sk-secret-1234', mode: 'direct' }), {
    providerId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt', mode: 'direct', hasApiKey: true, maskedApiKey: '••••1234',
  });
});
