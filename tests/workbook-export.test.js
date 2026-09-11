const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkbookPdfExporter,
  createWorkbookImageExporter,
  buildHtmlImageSvg,
  getA4ImageSize,
  fitPrintPages,
  loadSvgImage,
  createHtml2CanvasRenderer,
  replaceModernColors,
  getAdaptiveImageSize,
  getCanvasRenderScale,
  detectCanvasBounds,
} = require('../src/workbook-export');

function createElement() {
  return {
    children: [],
    className: '',
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
    },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    querySelectorAll() { return []; },
  };
}

test('exports five temporary pages once and restores after print', () => {
  const listeners = new Map();
  let printCalls = 0;
  let restoreCalls = 0;
  const windowObj = {
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    print() { printCalls += 1; },
  };
  const root = createElement();
  const exporter = createWorkbookPdfExporter({
    windowObj,
    root,
    documentObj: { createElement },
    renderPages(printRoot) {
      for (let index = 0; index < 5; index += 1) printRoot.appendChild(createElement());
    },
    onRestore() { restoreCalls += 1; },
    onError() { assert.fail('export should not fail'); },
  });

  assert.equal(exporter.exportPdf(), true);
  assert.equal(printCalls, 1);
  assert.equal(root.children[0].children.length, 5);
  assert.equal(root.classList.contains('xmc-printing'), true);

  listeners.get('afterprint')();
  assert.equal(root.children.length, 0);
  assert.equal(root.classList.contains('xmc-printing'), false);
  assert.equal(restoreCalls, 1);
});

test('reports unavailable print support without mutating the page', () => {
  const root = createElement();
  const errors = [];
  const exporter = createWorkbookPdfExporter({
    windowObj: {},
    root,
    documentObj: { createElement },
    renderPages() { assert.fail('pages should not render'); },
    onRestore() { assert.fail('nothing should restore'); },
    onError(message) { errors.push(message); },
  });

  assert.equal(exporter.exportPdf(), false);
  assert.deepEqual(errors, ['导出 PDF 失败，请使用浏览器打印功能重试。']);
  assert.equal(root.children.length, 0);
});

test('fits each workbook sheet inside one printable page', () => {
  const values = new Map();
  const page = {
    scrollWidth: 1000,
    scrollHeight: 2000,
    style: { setProperty(name, value) { values.set(name, value); } },
  };
  const frame = { clientWidth: 500, clientHeight: 1200, firstElementChild: page };
  fitPrintPages({ querySelectorAll(selector) { return selector === 'details' ? [] : [frame]; } });

  assert.equal(values.get('--xmc-print-scale'), '0.5');
});

test('expands source details before measuring printable pages', () => {
  const details = { setAttribute(name, value) { this[name] = value; } };
  fitPrintPages({
    querySelectorAll(selector) {
      return selector === 'details' ? [details] : [];
    },
  });
  assert.equal(details.open, '');
});

test('uses A4 pixels and preserves the page orientation', () => {
  assert.deepEqual(getA4ImageSize(700, 1000), { width: 1654, height: 2339 });
  assert.deepEqual(getA4ImageSize(1000, 700), { width: 2339, height: 1654 });
});

test('uses a target-sized render scale for sharp local image export', () => {
  assert.equal(getCanvasRenderScale({ width: 700, height: 1000 }), 2.36);
  assert.equal(getCanvasRenderScale({ width: 1000, height: 700 }), 2.34);
});

test('builds an adaptive image size from the painted content bounds', () => {
  assert.deepEqual(
    getAdaptiveImageSize(700, 1000, { left: 0, top: 120, width: 700, height: 720 }),
    { width: 1654, height: 1701 },
  );
});

test('detects the painted bounds from a rendered canvas', () => {
  const width = 8;
  const height = 6;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = 248;
    pixels[index * 4 + 1] = 241;
    pixels[index * 4 + 2] = 229;
    pixels[index * 4 + 3] = 255;
  }
  for (let y = 1; y < 5; y += 1) {
    for (let x = 2; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 243;
      pixels[offset + 1] = 233;
      pixels[offset + 2] = 221;
    }
  }
  const canvas = {
    width,
    height,
    getContext() {
      return { getImageData() { return { data: pixels }; } };
    },
  };

  assert.deepEqual(detectCanvasBounds(canvas), { left: 2, top: 1, width: 5, height: 4 });
});

test('retries SVG rasterization with a data URL when Blob URL loading fails', async () => {
  const sources = [];
  let revoked = false;
  class FakeImage {
    set src(value) {
      sources.push(value);
      if (sources.length === 1) this.onerror();
      else this.onload();
    }
  }
  const windowObj = {
    Blob: class Blob {},
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() { revoked = true; },
    },
    Image: FakeImage,
  };

  const result = await loadSvgImage('<svg/>', 10, 20, windowObj);
  assert.equal(result.width, 10);
  assert.equal(result.height, 20);
  assert.deepEqual(sources, ['blob:test', 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E']);
  assert.equal(revoked, true);
});

test('fails SVG rasterization when both image URL attempts time out', async () => {
  class FakeImage {
    set src(_value) {}
  }
  const windowObj = {
    Blob: class Blob {},
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    Image: FakeImage,
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  await assert.rejects(
    loadSvgImage('<svg/>', 10, 20, windowObj),
    /page rasterization failed/,
  );
});

test('exports each workbook page as the requested image format', async () => {
  const downloads = [];
  const root = createElement();
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    renderer: 'svg',
    renderPages(printRoot) {
      for (let index = 0; index < 5; index += 1) {
        const frame = createElement();
        frame.clientWidth = 700;
        frame.clientHeight = 1000;
        frame.firstElementChild = { scrollWidth: 700, scrollHeight: 1000, style: { setProperty() {} } };
        printRoot.appendChild(frame);
      }
    },
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    renderSvgImage: async () => ({ width: 700, height: 1000 }),
    download(blob, filename) { downloads.push({ blob, filename }); },
    onRestore() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.equal(downloads.length, 5);
  assert.deepEqual(downloads.map((item) => item.filename), [
    'shiji-report-page-01.png',
    'shiji-report-page-02.png',
    'shiji-report-page-03.png',
    'shiji-report-page-04.png',
    'shiji-report-page-05.png',
  ]);
  assert.ok(downloads.every((item) => item.blob.type === 'image/png'));

  downloads.length = 0;
  assert.equal(await exporter.exportImages('jpg'), true);
  assert.equal(downloads.length, 5);
  assert.ok(downloads.every((item) => item.filename.endsWith('.jpg')));
  assert.ok(downloads.every((item) => item.blob.type === 'image/jpeg'));
});

test('adaptive local export crops the rendered canvas before saving', async () => {
  const width = 8;
  const height = 6;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = 248;
    pixels[index * 4 + 1] = 241;
    pixels[index * 4 + 2] = 229;
    pixels[index * 4 + 3] = 255;
  }
  for (let y = 1; y < 5; y += 1) {
    for (let x = 2; x < 7; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 243;
      pixels[offset + 1] = 233;
      pixels[offset + 2] = 221;
    }
  }
  const sourceCanvas = {
    width,
    height,
    getContext() {
      return { getImageData() { return { data: pixels }; } };
    },
  };
  const output = {};
  const root = createElement();
  const frame = createElement();
  frame.firstElementChild = {
    getBoundingClientRect() { return { width: 700, height: 1000 }; },
  };
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    canvasMode: 'adaptive',
    renderPages(printRoot) { printRoot.appendChild(frame); },
    renderHtml2Canvas: async () => ({ image: sourceCanvas, width, height, pixelWidth: width, pixelHeight: height }),
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillRect() {},
            drawImage(...args) { output.drawImage = args; },
          };
        },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    download() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.deepEqual(output.drawImage, [sourceCanvas, 2, 1, 5, 4, 0, 0, 2339, 1871]);
});

test('exports only the requested workbook pages with their original page numbers', async () => {
  const downloads = [];
  const root = createElement();
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    renderer: 'svg',
    pageNumbers: [5, 2, 2],
    renderPages(printRoot) {
      for (let index = 0; index < 5; index += 1) {
        const frame = createElement();
        frame.clientWidth = 700;
        frame.clientHeight = 1000;
        frame.firstElementChild = { scrollWidth: 700, scrollHeight: 1000, style: { setProperty() {} } };
        printRoot.appendChild(frame);
      }
    },
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    renderSvgImage: async () => ({ width: 700, height: 1000 }),
    download(blob, filename) { downloads.push({ blob, filename }); },
    onRestore() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.deepEqual(downloads.map((item) => item.filename), [
    'shiji-report-page-02.png',
    'shiji-report-page-05.png',
  ]);
});

test('uses the local DOM renderer without foreignObject canvas tainting', async () => {
  const calls = [];
  const element = { ownerDocument: { defaultView: {} } };
  const windowObj = {
    html2canvas: async (target, options) => {
      calls.push({ target, options });
      return { width: 700, height: 1000 };
    },
  };

  const rendered = await createHtml2CanvasRenderer(element, windowObj);

  assert.equal(rendered.width, 700);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, element);
  assert.equal(calls[0].options.foreignObjectRendering, false);
  assert.equal(calls[0].options.allowTaint, false);
  assert.equal(calls[0].options.useCORS, true);
});

test('injects the export stylesheet into the html2canvas clone', async () => {
  const styleNodes = [];
  const documentObj = {
    createElement(tagName) {
      assert.equal(tagName, 'style');
      return { textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; } };
    },
  };
  const element = { ownerDocument: documentObj };
  const windowObj = {
    html2canvas: async (_target, options) => {
      const clonedDocument = {
        createElement: documentObj.createElement,
        head: { appendChild(node) { styleNodes.push(node); } },
        body: { id: '', classList: { add(value) { this.value = value; } } },
        querySelector() { return null; },
        querySelectorAll() { return []; },
      };
      options.onclone(clonedDocument);
      return { width: 700, height: 1000 };
    },
  };

  await createHtml2CanvasRenderer(element, windowObj, { styleText: '.xmc-workbook-page { color: rgb(40, 30, 26); }' });

  assert.equal(styleNodes.length, 1);
  assert.match(styleNodes[0].textContent, /rgb\(40, 30, 26\)/);
  assert.equal(styleNodes[0].getAttribute('data-xmc-export-styles'), 'true');
});

test('enables the RGB export stylesheet only while canvas pages render', async () => {
  const root = createElement();
  const frame = createElement();
  frame.firstElementChild = { getBoundingClientRect: () => ({ width: 700, height: 1000 }) };
  let rgbEnabledDuringRender = false;
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    renderPages(printRoot) { printRoot.appendChild(frame); },
    renderHtml2Canvas: async () => {
      rgbEnabledDuringRender = root.classList.contains('xmc-canvas-export-colors');
      return { width: 700, height: 1000 };
    },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    download() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.equal(rgbEnabledDuringRender, true);
  assert.equal(root.classList.contains('xmc-canvas-export-colors'), false);
});

test('passes loaded export styles into each canvas render', async () => {
  const styleArgs = [];
  const root = createElement();
  const frame = createElement();
  frame.firstElementChild = { getBoundingClientRect: () => ({ width: 700, height: 1000 }) };
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    renderPages(printRoot) { printRoot.appendChild(frame); },
    loadExportStyles: async () => '.xmc-workbook-page { color: rgb(40, 30, 26); }',
    renderHtml2Canvas: async (_element, options) => {
      styleArgs.push(options.styleText);
      return { width: 700, height: 1000 };
    },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    download() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.deepEqual(styleArgs, ['.xmc-workbook-page { color: rgb(40, 30, 26); }']);
});

test('default canvas renderer forwards loaded styles to html2canvas', async () => {
  const styleNodes = [];
  const root = createElement();
  const frame = createElement();
  frame.firstElementChild = { getBoundingClientRect: () => ({ width: 700, height: 1000 }) };
  const documentObj = {
    createElement(tagName) {
      if (tagName === 'style') {
        return { textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; } };
      }
      return createElement();
    },
  };
  const windowObj = {
    fetch: async () => ({ ok: true, text: async () => '.xmc-workbook-page { color: rgb(40, 30, 26); }' }),
    chrome: { runtime: { getURL: (path) => path } },
    html2canvas: async (_target, options) => {
      options.onclone({
        createElement: documentObj.createElement,
        head: { appendChild(node) { styleNodes.push(node); } },
        body: { id: '', classList: { add() {} } },
        querySelector() { return null; },
        querySelectorAll() { return []; },
      });
      return { width: 700, height: 1000 };
    },
  };
  const exporter = createWorkbookImageExporter({
    windowObj,
    documentObj,
    root,
    renderPages(printRoot) { printRoot.appendChild(frame); },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    download() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.equal(styleNodes.length, 1);
  assert.match(styleNodes[0].textContent, /rgb\(40, 30, 26\)/);
});

test('normalizes modern CSS colors before handing a page to the canvas renderer', () => {
  const normalized = replaceModernColors('border: 1px solid oklch(0.43 0.135 25 / 75%);');
  assert.doesNotMatch(normalized, /oklch\(/);
  assert.match(normalized, /rgba?\(/);
});

test('uses the local DOM renderer by default for image export', async () => {
  const calls = [];
  const root = createElement();
  const frame = createElement();
  frame.clientWidth = 700;
  frame.clientHeight = 1000;
  frame.firstElementChild = { scrollWidth: 700, scrollHeight: 1000, style: { setProperty() {} } };
  const exporter = createWorkbookImageExporter({
    windowObj: { html2canvas: async () => { calls.push('html2canvas'); return { width: 700, height: 1000 }; } },
    documentObj: { createElement },
    root,
    renderPages(printRoot) { printRoot.appendChild(frame); },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    renderSvgImage: async () => { calls.push('svg'); return { width: 700, height: 1000 }; },
    download() {},
    onRestore() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.deepEqual(calls, ['html2canvas']);
});

test('does not start downloads when a later selected page cannot render', async () => {
  const downloads = [];
  let renderCalls = 0;
  const root = createElement();
  const exporter = createWorkbookImageExporter({
    windowObj: { html2canvas: async () => ({ width: 700, height: 1000 }) },
    documentObj: { createElement },
    root,
    pageNumbers: [1, 2],
    renderPages(printRoot) {
      for (let index = 0; index < 2; index += 1) {
        const frame = createElement();
        frame.firstElementChild = { getBoundingClientRect: () => ({ width: 700, height: 1000 }) };
        printRoot.appendChild(frame);
      }
    },
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    renderHtml2Canvas: async () => {
      renderCalls += 1;
      if (renderCalls === 2) throw new Error('second page failed');
      return { width: 700, height: 1000 };
    },
    download(blob, filename) { downloads.push({ blob, filename }); },
    onRestore() {},
    onError() {},
  });

  assert.equal(await exporter.exportImages('png'), false);
  assert.equal(downloads.length, 0);
});

test('keeps the extension root selector when rasterizing a workbook page', () => {
  const element = {
    outerHTML: '<section class="xmc-workbook-page"></section>',
    cloneNode() {
      return { outerHTML: this.outerHTML, style: { cssText: '' } };
    },
    getBoundingClientRect() { return { width: 700, height: 1000 }; },
  };
  const result = buildHtmlImageSvg(element, {
    styleSheets: [{ cssRules: [{ cssText: '#xhs-task-material-collector-root .xmc-workbook-page { color: red; }' }] }],
  });

  assert.match(result.svg, /id="xhs-task-material-collector-root"/);
  assert.match(result.svg, /xmc-workbook-page/);
  assert.match(result.svg, /color: red/);
});

test('routes image downloads through the extension background when available', async () => {
  const messages = [];
  const root = createElement();
  const exporter = createWorkbookImageExporter({
    windowObj: {
      chrome: {
        runtime: {
          sendMessage(message, callback) {
            messages.push(message);
            callback({ ok: true });
          },
          lastError: null,
        },
      },
    },
    documentObj: { createElement },
    root,
    renderer: 'svg',
    renderPages(printRoot) {
      const frame = createElement();
      frame.clientWidth = 700;
      frame.clientHeight = 1000;
      printRoot.appendChild(frame);
    },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) {
          callback({ type, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
        },
      };
    },
    renderSvgImage: async () => ({ width: 700, height: 1000 }),
    onRestore() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('png'), true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'XMC_DOWNLOAD_FILE');
  assert.match(messages[0].filename, /\.png$/);
  assert.match(messages[0].url, /^data:/);
});

test('falls back to a native download when the extension background is unavailable', async () => {
  let clicked = 0;
  const links = [];
  const root = createElement();
  const documentObj = {
    createElement(tag) {
      if (tag === 'a') {
        const link = createElement();
        link.click = () => { clicked += 1; };
        links.push(link);
        return link;
      }
      return createElement();
    },
  };
  const windowObj = {
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    },
  };
  const exporter = createWorkbookImageExporter({
    windowObj,
    documentObj,
    root,
    renderer: 'svg',
    renderPages(printRoot) {
      const frame = createElement();
      frame.clientWidth = 700;
      frame.clientHeight = 1000;
      printRoot.appendChild(frame);
    },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type, arrayBuffer: async () => new Uint8Array([1]).buffer }); },
      };
    },
    renderSvgImage: async () => ({ width: 700, height: 1000 }),
    onRestore() {},
    onError(error) { assert.fail(error); },
  });

  assert.equal(await exporter.exportImages('jpg'), true);
  assert.equal(clicked, 1);
  assert.equal(links[0].download, 'shiji-report-page-01.jpg');
});

test('reports the download layer error when image saving fails', async () => {
  const errors = [];
  const root = createElement();
  const exporter = createWorkbookImageExporter({
    windowObj: {},
    documentObj: { createElement },
    root,
    renderer: 'svg',
    renderPages(printRoot) {
      const frame = createElement();
      frame.clientWidth = 700;
      frame.clientHeight = 1000;
      printRoot.appendChild(frame);
    },
    createCanvas() {
      return {
        getContext() { return { fillRect() {}, drawImage() {} }; },
        toBlob(callback, type) { callback({ type }); },
      };
    },
    renderSvgImage: async () => ({ width: 700, height: 1000 }),
    download() { throw new Error('offscreen download failed'); },
    onRestore() {},
    onError(error) { errors.push(error); },
  });

  assert.equal(await exporter.exportImages('png'), false);
  assert.equal(errors[0], '导出 PNG 失败，请重试。（offscreen download failed）');
});
