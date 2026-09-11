(function initWorkbookImagePrototype(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.XhsWorkbookImagePrototype = api;
}(function createWorkbookImagePrototypeApi() {
  const DEFAULT_ENDPOINT = 'http://127.0.0.1:8765/api/v1/experimental/workbook-images';

  function normalizePageNumbers(values) {
    const pages = [...new Set((Array.isArray(values) ? values : []).map(Number))]
      .sort((left, right) => left - right);
    if (!pages.length) throw new Error('至少选择一页');
    if (pages.some((page) => !Number.isInteger(page) || page < 1 || page > 5)) {
      throw new Error('页码必须在 1 到 5 之间');
    }
    return pages;
  }

  function normalizeCanvasMode(value = 'a4') {
    if (value !== 'a4' && value !== 'adaptive') throw new Error('图片画布模式无效');
    return value;
  }

  function buildPrintDocument({ markup, cssText }) {
    const safeCss = String(cssText || '').replace(/<\/style/gi, '<\\/style');
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>${safeCss}</style>
<style>html, body { margin: 0; } body { display: block !important; background: white; }</style>
</head>
<body>
<section id="xhs-task-material-collector-root" class="xmc-printing">${String(markup || '')}</section>
</body>
</html>`;
  }

  function runtimeDownload(message) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('扩展下载服务不可用'));
        return;
      }
      globalThis.chrome.runtime.sendMessage(
        { type: 'XMC_DOWNLOAD_FILE', ...message },
        (response) => {
          const runtimeError = globalThis.chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || '图片下载失败'));
            return;
          }
          resolve(response);
        },
      );
    });
  }

  function runtimeFetchWorkbookImages({ html, pageNumbers, canvasMode }) {
    return new Promise((resolve, reject) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('扩展后台转换服务不可用'));
        return;
      }
      globalThis.chrome.runtime.sendMessage(
        { type: 'XMC_FETCH_WORKBOOK_IMAGES', html, pageNumbers, canvasMode },
        (response) => {
          const runtimeError = globalThis.chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || '本机图片服务请求失败'));
            return;
          }
          resolve(response.payload);
        },
      );
    });
  }

  function validateResponse(payload, selectedPages) {
    const pages = Array.isArray(payload?.pages) ? payload.pages : [];
    const returned = pages.map((page) => page?.pageNumber);
    if (
      returned.length !== selectedPages.length
      || returned.some((pageNumber, index) => pageNumber !== selectedPages[index])
    ) {
      throw new Error('后端返回页面与所选页面不一致');
    }
    pages.forEach((page) => {
      const expectedFilename = `shiji-report-page-${String(page.pageNumber).padStart(2, '0')}.png`;
      if (
        page.filename !== expectedFilename
        || page.mimeType !== 'image/png'
        || typeof page.dataBase64 !== 'string'
        || !page.dataBase64
      ) {
        throw new Error(`第 ${page.pageNumber} 页图片响应无效`);
      }
    });
    return pages;
  }

  function createWorkbookImagePrototypeClient({
    fetchFn,
    download = runtimeDownload,
    endpoint = DEFAULT_ENDPOINT,
  } = {}) {
    async function exportPages({ html, pageNumbers, canvasMode = 'a4' }) {
      const selectedPages = normalizePageNumbers(pageNumbers);
      const normalizedCanvasMode = normalizeCanvasMode(canvasMode);
      let payload;
      if (typeof fetchFn === 'function') {
        const response = await fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html,
            pageNumbers: selectedPages,
            canvasMode: normalizedCanvasMode,
          }),
        });
        try {
          payload = await response.json();
        } catch (_error) {
          throw new Error('本机图片服务返回了无法识别的响应');
        }
        if (!response.ok) {
          throw new Error(payload?.detail?.message || '实验 PNG 导出失败');
        }
      } else {
        payload = await runtimeFetchWorkbookImages({
          html,
          pageNumbers: selectedPages,
          canvasMode: normalizedCanvasMode,
        });
      }
      const pages = validateResponse(payload, selectedPages);
      for (const page of pages) {
        await download({
          filename: page.filename,
          url: `data:${page.mimeType};base64,${page.dataBase64}`,
        });
      }
      return { pageNumbers: selectedPages };
    }

    return { exportPages };
  }

  return {
    buildPrintDocument,
    createWorkbookImagePrototypeClient,
    normalizeCanvasMode,
    normalizePageNumbers,
    validateResponse,
  };
}));
