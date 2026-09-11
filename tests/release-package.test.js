const assert = require('node:assert/strict');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (name) => readFile(path.join(root, name), 'utf8');

test('local preview docs identify the required local service and preview status', async () => {
  const [readme, preview, releaseNotes] = await Promise.all([
    read('README.md'),
    read('LOCAL_PREVIEW.md'),
    read('docs/releases/v0.3-local-preview.md'),
  ]);
  assert.match(readme, /v0\.3-local-preview/);
  assert.match(preview, /127\.0\.0\.1:8765/);
  assert.match(preview, /不是 Chrome Web Store 的安装即用版本/);
  assert.match(releaseNotes, /本地预览版/);
  assert.match(releaseNotes, /xhs-task-material-collector-v0\.3\.0\.zip/);
  assert.match(releaseNotes, /已知限制/);
});

test('packager stages only extension runtime directories', async () => {
  const script = await read('scripts/package-local-preview.ps1');
  assert.match(script, /manifest\.json/);
  assert.match(script, /src/);
  assert.match(script, /assets/);
  assert.match(script, /CreateEntry/);
  assert.doesNotMatch(script, /Copy-Item.*backend/);
});

test('public preview ignores local secrets and generated output', async () => {
  const ignore = await read('.gitignore');
  assert.match(ignore, /\.env/);
  assert.match(ignore, /dist/);
  assert.match(ignore, /\.pytest_cache/);
});

test('public source release includes ownership restrictions and publication checklist', async () => {
  const [license, checklist, readme] = await Promise.all([
    read('LICENSE.md'), read('PUBLIC_SOURCE_CHECKLIST.md'), read('README.md'),
  ]);
  assert.match(license, /All rights reserved/);
  assert.match(license, /non-commercial local use/);
  assert.match(checklist, /API keys/);
  assert.match(checklist, /GitHub.*fork/i);
  assert.match(readme, /LICENSE\.md/);
});

test('packager reads the UTF-8 manifest explicitly for Windows PowerShell 5.1', async () => {
  const script = await read('scripts/package-local-preview.ps1');
  assert.match(script, /Get-Content[^\r\n]*manifestPath[^\r\n]*-Encoding\s+UTF8/);
});

test('packager accepts runtime directories represented by archived file prefixes', async () => {
  const script = await read('scripts/package-local-preview.ps1');
  assert.match(script, /StartsWith\(\$requiredEntry,\s*\[StringComparison\]::OrdinalIgnoreCase\)/);
});

test('packager normalizes Windows ZIP entry separators before validation', async () => {
  const script = await read('scripts/package-local-preview.ps1');
  assert.match(script, /FullName\.Replace\(\s*["']\\["']\s*,\s*["']\/["']\s*\)/);
});

test('packager computes SHA-256 without relying on an autoloaded PowerShell cmdlet', async () => {
  const script = await read('scripts/package-local-preview.ps1');
  assert.match(script, /Security\.Cryptography\.SHA256\]::Create\(\)/);
  assert.doesNotMatch(script, /Get-FileHash/);
});
