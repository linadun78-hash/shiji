const test = require('node:test');
const assert = require('node:assert/strict');

const presets = require('../src/provider-presets');

test('offers common OpenAI-compatible providers plus a custom option', () => {
  assert.deepEqual(
    presets.listProviderPresets().map((item) => item.id),
    ['deepseek', 'aliyun', 'openai', 'moonshot', 'siliconflow', 'custom'],
  );
});

test('returns editable defaults for a selected provider', () => {
  assert.deepEqual(presets.getProviderPreset('deepseek'), {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  });
  assert.equal(presets.getProviderPreset('missing'), null);
});

test('infers a provider from a saved URL without overwriting custom endpoints', () => {
  assert.equal(presets.inferProviderId('https://api.siliconflow.cn/v1/'), 'siliconflow');
  assert.equal(presets.inferProviderId('https://gateway.example.com/v1'), 'custom');
  assert.equal(presets.inferProviderId(''), 'custom');
});
