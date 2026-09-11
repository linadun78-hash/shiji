const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const background = fs.readFileSync(path.join(__dirname, '..', 'src', 'background-bundle.js'), 'utf8');

test('report material collection is restricted to the requested task', () => {
  assert.doesNotMatch(background, /importScripts\(/);
  assert.match(background, /collectReportMaterials\(selectedIds, taskId\)/);
  assert.match(background, /material\.taskId === taskId/);
  assert.match(background, /message\.taskId/);
  assert.match(background, /message\.reportPreset/);
  assert.match(background, /message\.familiarityLevel/);
  assert.match(background, /message\.supplementMode/);
  assert.match(background, /XMC_DOWNLOAD_FILE/);
  assert.doesNotMatch(background, /XMC_FETCH_WORKBOOK_IMAGES/);
  assert.doesNotMatch(background, /\/api\/v1\/experimental\/workbook-images/);
  assert.match(background, /chrome\.downloads\.download/);
  assert.match(background, /waitForDownloadResult/);
  assert.match(background, /typeof navigator !== 'undefined'/);
});
