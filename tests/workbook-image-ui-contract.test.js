const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const content = fs.readFileSync(path.join(root, 'src', 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'content.css'), 'utf8');


test('keeps image conversion inside the extension export runtime', () => {
  const scripts = manifest.content_scripts[0].js;
  assert.equal(scripts.includes('src/workbook-image-prototype.js'), false);
  assert.ok(scripts.includes('src/vendor/html2canvas.min.js'));
  assert.ok(scripts.indexOf('src/vendor/html2canvas.min.js') < scripts.indexOf('src/workbook-export.js'));
  assert.ok(scripts.indexOf('src/workbook-export.js') < scripts.indexOf('src/content.js'));
});


test('keeps PDF export and gates browser-local PNG/JPG export with one flag', () => {
  assert.match(content, /ENABLE_WORKBOOK_IMAGE_EXPORT\s*=\s*true/);
  assert.match(content, /导出 PDF/);
  assert.match(content, /选择图片页/);
  assert.match(content, /PNG/);
  assert.match(content, /JPG/);
  assert.doesNotMatch(content, /实验 PNG/);
  assert.match(content, /WORKBOOK_IMAGE_CANVAS_MODE\s*=\s*'adaptive'/);
  assert.match(content, /canvasMode:\s*WORKBOOK_IMAGE_CANVAS_MODE/);
  assert.match(content, /xmc-workbook-image-page/);
  assert.match(content, /aria-pressed/);
  assert.match(content, /xmc-workbook-image-status/);
  assert.match(content, /xmc-workbook-image-format/);
  assert.match(content, /pageNumber <= 5/);
  assert.match(css, /\.xmc-workbook-image-export/);
  assert.match(css, /\.xmc-workbook-image-panel\s*\{[^}]*position:\s*static/s);
});
