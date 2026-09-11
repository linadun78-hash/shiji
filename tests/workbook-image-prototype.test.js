const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrintDocument,
  createWorkbookImagePrototypeClient,
  normalizeCanvasMode,
  normalizePageNumbers,
} = require('../src/workbook-image-prototype');


test('normalizes arbitrary selected pages and rejects invalid selections', () => {
  assert.deepEqual(normalizePageNumbers(['3', 1, 3]), [1, 3]);
  assert.throws(() => normalizePageNumbers([]), /至少选择一页/);
  assert.throws(() => normalizePageNumbers([0]), /1 到 5/);
  assert.throws(() => normalizePageNumbers([6]), /1 到 5/);
});


test('normalizes supported canvas modes and rejects unknown modes', () => {
  assert.equal(normalizeCanvasMode(), 'a4');
  assert.equal(normalizeCanvasMode('adaptive'), 'adaptive');
  assert.throws(() => normalizeCanvasMode('stretch'), /画布模式/);
});


test('builds a self-contained print document with the extension root', () => {
  const html = buildPrintDocument({
    markup: '<div class="xmc-workbook-print"><section>page</section></div>',
    cssText: '#xhs-task-material-collector-root section { color: red; }',
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /id="xhs-task-material-collector-root"/);
  assert.match(html, /class="xmc-printing"/);
  assert.match(html, /color: red/);
  assert.match(html, /body\s*\{\s*display:\s*block\s*!important/);
});


test('requests selected pages and downloads only after the whole response validates', async () => {
  const requests = [];
  const downloads = [];
  const client = createWorkbookImagePrototypeClient({
    async fetchFn(url, options) {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            pages: [
              { pageNumber: 1, filename: 'shiji-report-page-01.png', mimeType: 'image/png', dataBase64: 'cGFnZS0x' },
              { pageNumber: 3, filename: 'shiji-report-page-03.png', mimeType: 'image/png', dataBase64: 'cGFnZS0z' },
            ],
          };
        },
      };
    },
    async download(message) { downloads.push(message); },
  });

  const result = await client.exportPages({
    html: '<html></html>',
    pageNumbers: [3, 1],
    canvasMode: 'adaptive',
  });

  assert.deepEqual(JSON.parse(requests[0].options.body).pageNumbers, [1, 3]);
  assert.equal(JSON.parse(requests[0].options.body).canvasMode, 'adaptive');
  assert.equal(downloads.length, 2);
  assert.equal(downloads[0].filename, 'shiji-report-page-01.png');
  assert.equal(downloads[0].url, 'data:image/png;base64,cGFnZS0x');
  assert.deepEqual(result, { pageNumbers: [1, 3] });
});


test('starts no downloads when one selected page is missing', async () => {
  const downloads = [];
  const client = createWorkbookImagePrototypeClient({
    async fetchFn() {
      return {
        ok: true,
        async json() {
          return {
            pages: [
              { pageNumber: 1, filename: 'shiji-report-page-01.png', mimeType: 'image/png', dataBase64: 'cGFnZS0x' },
            ],
          };
        },
      };
    },
    async download(message) { downloads.push(message); },
  });

  await assert.rejects(
    client.exportPages({ html: '<html></html>', pageNumbers: [1, 3] }),
    /返回页面与所选页面不一致/,
  );
  assert.deepEqual(downloads, []);
});


test('surfaces backend error details and starts no downloads', async () => {
  const downloads = [];
  const client = createWorkbookImagePrototypeClient({
    async fetchFn() {
      return {
        ok: false,
        async json() { return { detail: { message: '实验图片组件尚未安装' } }; },
      };
    },
    async download(message) { downloads.push(message); },
  });

  await assert.rejects(
    client.exportPages({ html: '<html></html>', pageNumbers: [2] }),
    /实验图片组件尚未安装/,
  );
  assert.deepEqual(downloads, []);
});


test('uses the extension background for conversion by default', async () => {
  const messages = [];
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        if (message.type === 'XMC_FETCH_WORKBOOK_IMAGES') {
          callback({
            ok: true,
            payload: {
              pages: [
                { pageNumber: 2, filename: 'shiji-report-page-02.png', mimeType: 'image/png', dataBase64: 'cGFnZS0y' },
              ],
            },
          });
          return;
        }
        callback({ ok: true, downloadId: 42 });
      },
    },
  };
  try {
    const client = createWorkbookImagePrototypeClient();
    const result = await client.exportPages({
      html: '<html></html>',
      pageNumbers: [2],
      canvasMode: 'adaptive',
    });

    assert.deepEqual(result, { pageNumbers: [2] });
    assert.deepEqual(messages[0], {
      type: 'XMC_FETCH_WORKBOOK_IMAGES',
      html: '<html></html>',
      pageNumbers: [2],
      canvasMode: 'adaptive',
    });
    assert.deepEqual(messages.map((message) => message.type), [
      'XMC_FETCH_WORKBOOK_IMAGES',
      'XMC_DOWNLOAD_FILE',
    ]);
  } finally {
    globalThis.chrome = previousChrome;
  }
});


test('defaults omitted canvas mode to a4', async () => {
  let requestBody;
  const client = createWorkbookImagePrototypeClient({
    async fetchFn(_url, options) {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            pages: [
              {
                pageNumber: 1,
                filename: 'shiji-report-page-01.png',
                mimeType: 'image/png',
                dataBase64: 'cGFnZQ==',
              },
            ],
          };
        },
      };
    },
    async download() {},
  });

  await client.exportPages({ html: '<html></html>', pageNumbers: [1] });

  assert.equal(requestBody.canvasMode, 'a4');
});
