const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeEnv = fs.readFileSync(path.join(__dirname, '..', 'src', 'runtime-env.js'), 'utf8');

test('public runtime environment is local by default and contains no secret fields', () => {
  assert.match(runtimeEnv, /mode:\s*'local'/);
  assert.match(runtimeEnv, /apiBaseUrl:\s*'http:\/\/127\.0\.0\.1:8765'/);
  assert.match(runtimeEnv, /domain:\s*''/);
  assert.match(runtimeEnv, /clientId:\s*''/);
  assert.match(runtimeEnv, /audience:\s*''/);
  assert.doesNotMatch(runtimeEnv, /clientSecret|apiKey|password|privateKey/i);
});
