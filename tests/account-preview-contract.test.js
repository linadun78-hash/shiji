const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const preview = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ui-preview.html'), 'utf8');

test('static preview can open a signed-in cloud account without real Auth0 credentials', () => {
  assert.match(preview, /account=cloud/);
  assert.match(preview, /XMC_GET_AUTH_STATUS/);
  assert.match(preview, /authenticated:\s*true/);
  assert.match(preview, /旅行测试用户/);
  assert.match(preview, /\.xmc-settings-toggle/);
});

test('static preview can show the tutorial start page without a model call', () => {
  assert.match(preview, /report=tutorial/);
  assert.match(preview, /preflightActions/);
  assert.match(preview, /确认安装包/);
  assert.match(preview, /教程拆解预览/);
});

test('static preview loads the local manual repository used by the report save action', () => {
  assert.match(preview, /src\/tutorial-manual-repository\.js/);
});
