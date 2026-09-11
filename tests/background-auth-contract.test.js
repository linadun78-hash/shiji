const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'src', 'background-bundle.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('background source wires runtime config and Auth0 without exposing tokens to messages', () => {
  assert.match(source, /import '\.\/runtime-config\.js'/);
  assert.match(source, /import '\.\/auth-client\.js'/);
  assert.match(source, /XhsRuntimeConfig\.getRuntimeConfig/);
  assert.match(source, /XhsAuthClient\.createAuthClient/);
  assert.match(source, /XMC_GET_AUTH_STATUS/);
  assert.match(source, /XMC_AUTH_SIGN_IN/);
  assert.match(source, /XMC_AUTH_SIGN_OUT/);
  assert.match(source, /Authorization/);
  assert.doesNotMatch(source, /baseUrl:\s*'http:\/\/127\.0\.0\.1:8765'/);
  assert.doesNotMatch(source, /fetch\('http:\/\/127\.0\.0\.1:8765/);
});

test('manifest-loaded bundle contains the same authentication integration', () => {
  assert.doesNotMatch(bundle, /^import /m);
  assert.match(bundle, /XMC_RUNTIME_CONFIG/);
  assert.match(bundle, /root\.XhsRuntimeConfig = api/);
  assert.match(bundle, /root\.XhsAuthClient = api/);
  assert.match(bundle, /XMC_GET_AUTH_STATUS/);
  assert.match(bundle, /XMC_AUTH_SIGN_IN/);
  assert.match(bundle, /XMC_AUTH_SIGN_OUT/);
  assert.match(bundle, /headers\.set\('Authorization'/);
  assert.doesNotMatch(bundle, /baseUrl:\s*'http:\/\/127\.0\.0\.1:8765'/);
});

test('background bundle has a reproducible build command', () => {
  assert.equal(packageJson.scripts['build:background'], 'node scripts/build-background-bundle.mjs');
});
