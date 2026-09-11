const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const filename of ['background.js', 'background-bundle.js']) {
  test(`${filename} connection test requests JSON with a valid example`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
    const start = source.indexOf("if (message.type === 'XMC_TEST_PROVIDER_SETTINGS')");
    const end = source.indexOf("if (message.type === 'XMC_MARK_PROVIDER_TESTED')", start);
    assert.ok(start >= 0 && end > start, 'connection test handler must exist');
    const handler = source.slice(start, end);
    const prompt = handler.match(/messages: \[\{ role: 'user', content: '([^']+)' \}\]/)?.[1];
    assert.ok(prompt, 'connection test must send a user prompt');
    assert.match(prompt, /\bjson\b/i, 'JSON mode requires json in the prompt');
    const example = prompt.match(/\{[^{}]+\}/)?.[0];
    assert.ok(example, 'prompt must include a JSON response example');
    assert.deepEqual(JSON.parse(example), { ok: true });
  });
}
