const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '..', 'manifest.json');

test('registers one service worker and only the required backend origin', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'downloads', 'identity']);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.xiaohongshu.com/*',
    'http://127.0.0.1:8765/*',
    'https://*.auth0.com/*',
  ]);
  assert.deepEqual(manifest.background, { service_worker: 'src/background-bundle.js' });
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.equal(manifest.permissions.includes('tabs'), false);
});

test('injects only on Xiaohongshu with dependencies in order', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const contentScript = manifest.content_scripts[0];

  assert.deepEqual(contentScript.matches, ['https://www.xiaohongshu.com/*']);
  assert.deepEqual(contentScript.js, [
    'src/runtime-env.js',
    'src/runtime-config.js',
    'src/material.js',
    'src/xhs-adapter.js',
    'src/repository.js',
    'src/analysis-repository.js',
    'src/report-repository.js',
    'src/tutorial-manual-repository.js',
    'src/provider-presets.js',
    'src/ui-model.js',
    'src/vendor/html2canvas.min.js',
    'src/workbook-export.js',
    'src/content.js',
  ]);
  assert.deepEqual(contentScript.css, ['src/content.css', 'src/export-rgb.css']);
  assert.equal(contentScript.run_at, 'document_idle');
  assert.equal(manifest.version, '0.3.0');
});

test('exposes only the local brand asset and experiment print styles to Xiaohongshu pages', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['assets/shiji-mark.svg', 'src/content.css', 'src/export-rgb.css'],
    matches: ['https://www.xiaohongshu.com/*'],
  }]);
});
