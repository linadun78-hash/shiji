(function initWorkbookExport(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.XhsWorkbookExport = api;
}(function createWorkbookExportApi() {
  const ERROR_MESSAGE = '导出 PDF 失败，请使用浏览器打印功能重试。';
  const IMAGE_ERROR_MESSAGES = {
    png: '导出 PNG 失败，请重试。',
    jpg: '导出 JPG 失败，请重试。',
  };
  const A4_PORTRAIT = { width: 1654, height: 2339 };
  const A4_LANDSCAPE = { width: 2339, height: 1654 };

  function fitPrintPages(printRoot) {
    [...printRoot.querySelectorAll('details')].forEach((details) => {
      details.setAttribute('open', '');
    });
    [...printRoot.querySelectorAll('.xmc-workbook-print-page')].forEach((frame) => {
      const page = frame.firstElementChild;
      if (!page) return;
      const widthScale = frame.clientWidth / Math.max(page.scrollWidth, 1);
      const heightScale = frame.clientHeight / Math.max(page.scrollHeight, 1);
      page.style.setProperty('--xmc-print-scale', String(Math.min(1, widthScale, heightScale)));
    });
  }

  function createWorkbookPdfExporter({
    windowObj,
    documentObj,
    root,
    renderPages,
    onRestore,
    onError,
    fitPages = fitPrintPages,
  }) {
    let cleanup = null;

    function finish() {
      if (!cleanup) return;
      const activeCleanup = cleanup;
      cleanup = null;
      windowObj.removeEventListener?.('afterprint', activeCleanup);
      activeCleanup();
    }

    function exportPdf() {
      if (cleanup) return false;
      if (typeof windowObj.print !== 'function') {
        onError(ERROR_MESSAGE);
        return false;
      }

      const printRoot = documentObj.createElement('div');
      printRoot.className = 'xmc-workbook-print';
      try {
        renderPages(printRoot);
        root.appendChild(printRoot);
        root.classList.add('xmc-printing');
        fitPages(printRoot);
        cleanup = () => {
          printRoot.remove();
          root.classList.remove('xmc-printing');
          onRestore();
        };
        windowObj.addEventListener('afterprint', finish, { once: true });
        windowObj.print();
        return true;
      } catch (_error) {
        if (cleanup) finish();
        else {
          printRoot.remove();
          root.classList.remove('xmc-printing');
        }
        onError(ERROR_MESSAGE);
        return false;
      }
    }

    return { exportPdf };
  }

  function getA4ImageSize(width, height) {
    return width > height ? { ...A4_LANDSCAPE } : { ...A4_PORTRAIT };
  }

  function getCanvasRenderScale(rect = {}) {
    const width = Number(rect?.width) || 1;
    const height = Number(rect?.height) || 1;
    const target = getA4ImageSize(width, height);
    const sourceWidth = Math.max(1, width);
    return Math.round((target.width / sourceWidth) * 100) / 100;
  }

  function detectCanvasBounds(canvas, { tolerance = 4, coverage = 0.05 } = {}) {
    const width = Math.max(1, Number(canvas?.width) || 0);
    const height = Math.max(1, Number(canvas?.height) || 0);
    const context = canvas?.getContext?.('2d');
    if (!context || !width || !height) return null;
    let imageData;
    try {
      imageData = context.getImageData(0, 0, width, height)?.data;
    } catch (_error) {
      return null;
    }
    if (!imageData || imageData.length < width * height * 4) return null;
    const background = [imageData[0], imageData[1], imageData[2], imageData[3]];
    const isPainted = (offset) => {
      const alpha = imageData[offset + 3];
      if (!alpha) return false;
      return Math.max(
        Math.abs(imageData[offset] - background[0]),
        Math.abs(imageData[offset + 1] - background[1]),
        Math.abs(imageData[offset + 2] - background[2]),
        Math.abs(alpha - background[3]),
      ) > tolerance;
    };
    const minCoverage = Math.max(1, Math.ceil(width * coverage));
    const paintedRows = [];
    for (let y = 0; y < height; y += 1) {
      let rowCount = 0;
      for (let x = 0; x < width; x += 1) {
        if (isPainted((y * width + x) * 4)) rowCount += 1;
      }
      if (rowCount >= minCoverage) paintedRows.push(y);
    }
    if (!paintedRows.length) return null;
    const top = paintedRows[0];
    const bottom = paintedRows[paintedRows.length - 1];
    let left = width;
    let right = -1;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isPainted((y * width + x) * 4)) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right < left) return null;
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
  }

  function getAdaptiveImageSize(width, height, bounds = {}) {
    const sourceWidth = Math.max(1, Number(width) || 1);
    const sourceHeight = Math.max(1, Number(height) || 1);
    const cropWidth = Math.max(1, Number(bounds.width) || sourceWidth);
    const cropHeight = Math.max(1, Number(bounds.height) || sourceHeight);
    const target = getA4ImageSize(sourceWidth, sourceHeight);
    return {
      width: target.width,
      height: Math.max(1, Math.round(cropHeight * target.width / cropWidth)),
    };
  }

  function normalizeImagePageNumbers(values, frameCount) {
    const count = Number.isInteger(frameCount) ? frameCount : 0;
    const source = values === undefined
      ? Array.from({ length: count }, (_item, index) => index + 1)
      : values;
    if (!Array.isArray(source) || !source.length) {
      throw new Error('至少选择一页');
    }
    const pages = [...new Set(source.map(Number))].sort((left, right) => left - right);
    if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > count)) {
      throw new Error(`页码必须在 1 到 ${count} 之间`);
    }
    return pages;
  }

  function readStyles(documentObj) {
    const rules = [];
    [...(documentObj.styleSheets || [])].forEach((sheet) => {
      try {
        [...(sheet.cssRules || [])].forEach((rule) => rules.push(rule.cssText));
      } catch (_error) {
        // Cross-origin stylesheets cannot be read; the page still exports with inline defaults.
      }
    });
    return rules.join('\n');
  }

  function escapeSvgStyle(value) {
    return String(value).replace(/<\/style/gi, '<\\/style');
  }

  async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  async function inlineCloneImages(clone, windowObj) {
    const images = [...(clone.querySelectorAll?.('img') || [])];
    const fetchImage = windowObj.fetch || globalThis.fetch;
    await Promise.all(images.map(async (image) => {
      const source = image.getAttribute?.('src') || image.src;
      if (!source || source.startsWith('data:') || !fetchImage) return;
      try {
        const response = await fetchImage(source, { mode: 'cors' });
        if (!response.ok) throw new Error('image request failed');
        image.setAttribute('src', await blobToDataUrl(await response.blob()));
      } catch (_error) {
        const placeholder = clone.ownerDocument?.createElement?.('span');
        if (!placeholder || !image.parentNode) return;
        placeholder.className = 'xmc-workbook-photo-placeholder';
        placeholder.textContent = '素材';
        image.parentNode.replaceChild(placeholder, image);
      }
    }));
  }

  function buildHtmlImageSvg(element, documentObj, cloneOverride) {
    const rect = element.getBoundingClientRect?.() || {};
    const width = Math.max(1, Math.ceil(rect.width || element.clientWidth || element.scrollWidth || 1));
    const height = Math.max(1, Math.ceil(rect.height || element.clientHeight || element.scrollHeight || 1));
    const clone = cloneOverride || element.cloneNode(true);
    clone.style.cssText = `${clone.style.cssText || ''};width:${width}px;height:${height}px;min-height:${height}px;transform:none;`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${escapeSvgStyle(readStyles(documentObj))}</style><div id="xhs-task-material-collector-root" class="xmc-image-export-snapshot">${clone.outerHTML}</div></div></foreignObject></svg>`;
    return { svg, width, height };
  }

  function rasterizeHtmlElement(element, documentObj, windowObj) {
    const clone = element.cloneNode(true);
    return inlineCloneImages(clone, windowObj).then(() => buildHtmlImageSvg(element, documentObj, clone));
  }

  function loadSvgImage(svg, width, height, windowObj) {
    const BlobCtor = windowObj.Blob || globalThis.Blob;
    const URLApi = windowObj.URL || globalThis.URL;
    const ImageCtor = windowObj.Image || globalThis.Image;
    if (!BlobCtor || !URLApi?.createObjectURL || !ImageCtor) return Promise.reject(new Error('image primitives unavailable'));
    const url = URLApi.createObjectURL(new BlobCtor([svg], { type: 'image/svg+xml' }));
    const fallbackUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return new Promise((resolve, reject) => {
      let triedFallback = false;
      let timer = null;
      const image = new ImageCtor();
      const finish = (callback, value) => {
        if (timer !== null) windowObj.clearTimeout?.(timer);
        URLApi.revokeObjectURL?.(url);
        callback(value);
      };
      const tryFallback = () => {
        if (timer !== null) windowObj.clearTimeout?.(timer);
        if (triedFallback) {
          finish(reject, new Error('page rasterization failed'));
          return;
        }
        triedFallback = true;
        timer = windowObj.setTimeout?.(() => finish(reject, new Error('page rasterization failed')), 8000) ?? null;
        image.src = fallbackUrl;
      };
      image.onload = () => finish(resolve, { image, width, height });
      image.onerror = () => {
        tryFallback();
      };
      timer = windowObj.setTimeout?.(tryFallback, 8000) ?? null;
      image.src = url;
    });
  }

  function parseCssNumber(value, scale = 1) {
    const text = String(value).trim();
    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return 0;
    return text.endsWith('%') ? number / 100 * scale : number;
  }

  function oklchToRgb(lightness, chroma, hue, alpha) {
    const L = parseCssNumber(lightness, 1);
    const C = parseCssNumber(chroma, 0.4);
    const radians = Number.parseFloat(hue) * Math.PI / 180;
    const a = C * Math.cos(radians);
    const b = C * Math.sin(radians);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    const channels = linear.map((value) => {
      const clamped = Math.max(0, Math.min(1, value));
      const encoded = clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
      return Math.round(encoded * 255);
    });
    const parsedAlpha = alpha === undefined ? 1 : parseCssNumber(alpha, 1);
    return parsedAlpha >= 1
      ? `rgb(${channels.join(', ')})`
      : `rgba(${channels.join(', ')}, ${Math.max(0, Math.min(1, parsedAlpha))})`;
  }

  function replaceModernColors(value) {
    return String(value).replace(/oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)(?:\s*\/\s*([^\)]+))?\s*\)/gi, (_match, lightness, chroma, hue, alpha) => (
      oklchToRgb(lightness, chroma, hue, alpha)
    ));
  }

  function normalizeDocumentColors(clonedDocument) {
    const elements = [clonedDocument.documentElement, ...clonedDocument.querySelectorAll('*')].filter(Boolean);
    elements.forEach((element) => {
      const style = clonedDocument.defaultView?.getComputedStyle?.(element);
      if (!style) return;
      for (let index = 0; index < style.length; index += 1) {
        const property = style[index];
        const value = style.getPropertyValue(property);
        const normalized = replaceModernColors(value);
        if (normalized === value) continue;
        try {
          element.style.setProperty(property, normalized, style.getPropertyPriority(property));
        } catch (_error) {
          // A read-only computed property can be ignored; visible colors are inlineable.
        }
      }
    });
  }

  function prepareExportClone(clonedDocument, styleText) {
    if (!clonedDocument) return;
    const style = styleText && clonedDocument.createElement?.('style');
    if (style) {
      style.setAttribute('data-xmc-export-styles', 'true');
      style.textContent = styleText;
      (clonedDocument.head || clonedDocument.documentElement || clonedDocument.body)?.appendChild?.(style);
    }
    const exportRoot = clonedDocument.querySelector?.('#xhs-task-material-collector-root')
      || clonedDocument.body;
    exportRoot?.classList?.add?.('xmc-canvas-export-colors');
    if (exportRoot && !exportRoot.id) exportRoot.id = 'xhs-task-material-collector-root';
    normalizeDocumentColors(clonedDocument);
  }

  async function createHtml2CanvasRenderer(element, windowObj, { styleText = '', scale } = {}) {
    const render = windowObj?.html2canvas;
    if (typeof render !== 'function') {
      throw new Error('本地图片渲染组件不可用');
    }
    const rect = element.getBoundingClientRect?.() || {};
    const canvas = await render(element, {
      backgroundColor: '#f8f1e5',
      foreignObjectRendering: false,
      allowTaint: false,
      useCORS: true,
      logging: false,
      scale: Number.isFinite(scale)
        ? Math.max(1, scale)
        : Math.max(1, Math.min(2, Number(windowObj?.devicePixelRatio) || 1)),
      onclone: (clonedDocument) => prepareExportClone(clonedDocument, styleText),
    });
    return {
      image: canvas,
      width: Math.max(1, Math.ceil(rect.width || canvas.width || 1)),
      height: Math.max(1, Math.ceil(rect.height || canvas.height || 1)),
      pixelWidth: Math.max(1, Number(canvas.width) || Math.ceil(rect.width || 1)),
      pixelHeight: Math.max(1, Number(canvas.height) || Math.ceil(rect.height || 1)),
    };
  }

  async function loadExportStylesheet(windowObj) {
    const fetchApi = windowObj?.fetch || globalThis.fetch;
    const getURL = windowObj?.chrome?.runtime?.getURL;
    if (typeof fetchApi !== 'function' || typeof getURL !== 'function') return '';
    const response = await fetchApi(getURL('src/export-rgb.css'));
    if (!response?.ok) throw new Error('导出样式不可用');
    return response.text();
  }

  function canvasBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas blob unavailable'))), mime, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadViaAnchor(documentObj, windowObj, blob, filename) {
    const URLApi = windowObj.URL || globalThis.URL;
    if (!URLApi?.createObjectURL) return Promise.reject(new Error('download primitives unavailable'));
    const url = URLApi.createObjectURL(blob);
    const link = documentObj.createElement('a');
    link.href = url;
    link.download = filename;
    link.setAttribute?.('aria-hidden', 'true');
    (documentObj.body || documentObj.documentElement)?.appendChild?.(link);
    try {
      link.click();
    } finally {
      windowObj.setTimeout?.(() => {
        link.remove?.();
        URLApi.revokeObjectURL?.(url);
      }, 1000);
    }
    return new Promise((resolve) => windowObj.setTimeout ? windowObj.setTimeout(resolve, 40) : resolve());
  }

  async function defaultDownload(documentObj, windowObj, blob, filename) {
    if (typeof windowObj.chrome?.runtime?.sendMessage === 'function') {
      try {
        const dataUrl = await blobToDataUrl(blob);
        const response = await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (callback) => (value) => {
            if (settled) return;
            settled = true;
            callback(value);
          };
          const timer = windowObj.setTimeout?.(() => {
            settled = true;
            reject(new Error('download response timeout'));
          }, 5000);
          windowObj.chrome.runtime.sendMessage(
            { type: 'XMC_DOWNLOAD_FILE', url: dataUrl, filename },
            finish((result) => {
              if (timer) windowObj.clearTimeout?.(timer);
              const error = windowObj.chrome.runtime.lastError;
              if (error) reject(new Error(error.message));
              else if (!result?.ok) reject(new Error(result?.error || 'download failed'));
              else resolve(result);
            }),
          );
        });
        return response;
      } catch (_error) {
        throw new Error(`extension download channel failed: ${_error?.message || 'unknown error'}`);
      }
    }
    return downloadViaAnchor(documentObj, windowObj, blob, filename);
  }

  function createWorkbookImageExporter({
    windowObj,
    documentObj,
    root,
    renderer = 'html2canvas',
    pageNumbers,
    renderPages,
    onRestore,
    onError,
    fitPages = fitPrintPages,
    canvasMode = 'a4',
    createCanvas = () => documentObj.createElement('canvas'),
    renderSvgImage = async (element) => {
      const { svg, width, height } = await rasterizeHtmlElement(element, documentObj, windowObj);
      return loadSvgImage(svg, width, height, windowObj);
    },
    renderHtml2Canvas = (element, options) => createHtml2CanvasRenderer(element, windowObj, options),
    download = (blob, filename) => defaultDownload(documentObj, windowObj, blob, filename),
    loadExportStyles = () => loadExportStylesheet(windowObj),
  }) {
    let active = false;

    async function exportImages(format) {
      if (active) return false;
      if (!['png', 'jpg'].includes(format)) {
        onError?.('不支持的图片格式。');
        return false;
      }
      if (!['svg', 'html2canvas'].includes(renderer)) {
        onError?.('不支持的图片渲染器。');
        return false;
      }
      active = true;
      const printRoot = documentObj.createElement('div');
      printRoot.className = 'xmc-workbook-print';
      try {
        renderPages(printRoot);
        root.appendChild(printRoot);
        root.classList.add('xmc-image-exporting');
        root.classList.add('xmc-canvas-export-colors');
        fitPages(printRoot);
        const exportStyleText = await loadExportStyles();
        const frames = [...(printRoot.children || [])];
        const selectedPages = normalizeImagePageNumbers(pageNumbers, frames.length);
        const pendingDownloads = [];
        for (const pageNumber of selectedPages) {
          const frame = frames[pageNumber - 1];
          const sourceElement = frame.firstElementChild || frame;
          const rendered = renderer === 'svg'
            ? await renderSvgImage(sourceElement)
            : await renderHtml2Canvas(sourceElement, {
              styleText: exportStyleText,
              scale: getCanvasRenderScale(sourceElement.getBoundingClientRect?.() || sourceElement),
            });
          const sourceImage = rendered.image || rendered;
          const sourceWidth = Math.max(1, Number(rendered.pixelWidth) || Number(sourceImage.width) || Number(rendered.width) || 1);
          const sourceHeight = Math.max(1, Number(rendered.pixelHeight) || Number(sourceImage.height) || Number(rendered.height) || 1);
          const adaptiveBounds = canvasMode === 'adaptive' ? detectCanvasBounds(sourceImage) : null;
          const crop = adaptiveBounds || { left: 0, top: 0, width: sourceWidth, height: sourceHeight };
          const size = canvasMode === 'adaptive'
            ? getAdaptiveImageSize(sourceWidth, sourceHeight, crop)
            : getA4ImageSize(rendered.width, rendered.height);
          const canvas = createCanvas();
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#f8f1e5';
          context.fillRect(0, 0, size.width, size.height);
          if (canvasMode === 'adaptive') {
            context.drawImage(sourceImage, crop.left, crop.top, crop.width, crop.height, 0, 0, size.width, size.height);
          } else {
            const scale = Math.min(size.width / rendered.width, size.height / rendered.height);
            const drawWidth = rendered.width * scale;
            const drawHeight = rendered.height * scale;
            context.drawImage(sourceImage, (size.width - drawWidth) / 2, (size.height - drawHeight) / 2, drawWidth, drawHeight);
          }
          const mime = format === 'png' ? 'image/png' : 'image/jpeg';
          const blob = await canvasBlob(canvas, mime, format === 'jpg' ? 0.92 : undefined);
          pendingDownloads.push({
            blob,
            filename: `shiji-report-page-${String(pageNumber).padStart(2, '0')}.${format}`,
          });
        }
        for (const { blob, filename } of pendingDownloads) await download(blob, filename);
        return true;
      } catch (error) {
        const detail = error?.message ? `（${error.message}）` : '';
        onError?.(`${IMAGE_ERROR_MESSAGES[format]}${detail}`);
        return false;
      } finally {
        printRoot.remove();
        root.classList.remove('xmc-image-exporting');
        root.classList.remove('xmc-canvas-export-colors');
        active = false;
        onRestore?.();
      }
    }

    return { exportImages };
  }

  return {
    createWorkbookPdfExporter,
    createWorkbookImageExporter,
    createHtml2CanvasRenderer,
    replaceModernColors,
    fitPrintPages,
    getA4ImageSize,
    getAdaptiveImageSize,
    getCanvasRenderScale,
    detectCanvasBounds,
    normalizeImagePageNumbers,
    buildHtmlImageSvg,
    loadSvgImage,
  };
}));
