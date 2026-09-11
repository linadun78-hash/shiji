(function exposeAdapterApi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsAdapter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAdapterApi() {
  const TITLE_SELECTORS = [
    '#detail-title',
    '[data-testid="note-title"]',
    '.note-content .title',
    '.note-content h1',
    '.note-title',
    'h1',
    '#noteContainer .title',
    '[class*="note-title"]',
  ];
  const BODY_SELECTORS = [
    '#detail-desc',
    '[data-testid="note-content"]',
    '.note-content .desc',
    '.note-content [class*="desc"]',
    '[class*="note-desc"]',
    '#noteContainer .desc',
  ];
  const AUTHOR_SELECTORS = [
    '.author-wrapper .username',
    '.author-container .username',
    '#noteContainer .username',
    '[data-testid="note-author"]',
    '.user-name',
    '[class*="username"]',
    '[class*="user-name"]',
  ];
  const IMAGE_SELECTORS = [
    '#noteContainer .note-slider-img',
    '#noteContainer .swiper-slide img',
    '[data-testid="note-image"]',
    '.note-content .swiper-slide img',
    '.note-content img',
    '[class*="note"] img',
  ];

  function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function cleanUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isSupportedNoteUrl(value) {
    try {
      const url = new URL(value);
      if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) {
        return false;
      }
      return /\/(?:explore|discovery\/item)\/[^/?#]+/i.test(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  function getAttribute(element, name) {
    if (!element || typeof element.getAttribute !== 'function') {
      return '';
    }
    return cleanText(element.getAttribute(name));
  }

  function isElementVisible(element) {
    if (!element || element.hidden || getAttribute(element, 'aria-hidden') === 'true') {
      return false;
    }
    if (typeof element.closest === 'function' && element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false;
    }
    const view = element.ownerDocument && element.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      const style = view.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    }
    return true;
  }

  function queryFirstVisibleElement(document, selectors) {
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector) || []);
      const visible = elements.find(isElementVisible);
      if (visible) {
        return visible;
      }
    }
    return null;
  }

  function queryFirstText(document, selectors) {
    const element = queryFirstVisibleElement(document, selectors);
    return cleanText(element && element.textContent);
  }

  function queryMeta(document, selector) {
    return getAttribute(document.querySelector(selector), 'content');
  }

  function queryMetaValues(document, selector) {
    return Array.from(document.querySelectorAll(selector) || [])
      .map((element) => getAttribute(element, 'content'))
      .filter(Boolean);
  }

  function getNoteId(value) {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/i);
      return match ? match[1] : '';
    } catch (_error) {
      return '';
    }
  }

  function hasMatchingCanonical(document, location) {
    const canonical = getAttribute(document.querySelector('link[rel="canonical"]'), 'href');
    return Boolean(
      isSupportedNoteUrl(canonical)
      && getNoteId(canonical)
      && getNoteId(canonical) === getNoteId(location && location.href),
    );
  }

  function queryImages(document) {
    const urls = [];
    for (const selector of IMAGE_SELECTORS) {
      const elements = Array.from(document.querySelectorAll(selector) || []);
      for (const image of elements) {
        if (!isElementVisible(image)) {
          continue;
        }
        const url = cleanUrl(
          image.currentSrc
          || image.src
          || getAttribute(image, 'src')
          || getAttribute(image, 'data-src'),
        );
        if (url && !urls.includes(url)) {
          urls.push(url);
        }
      }
    }
    return urls;
  }

  function getSourceUrl(document, location) {
    const canonical = getAttribute(document.querySelector('link[rel="canonical"]'), 'href');
    if (hasMatchingCanonical(document, location)) {
      return canonical;
    }
    return cleanUrl(location && location.href);
  }

  function getOpenUrl(document, location) {
    const canonical = getAttribute(document.querySelector('link[rel="canonical"]'), 'href');
    if (hasMatchingCanonical(document, location) && /[?&]xsec_token=/i.test(canonical)) {
      return canonical;
    }
    return cleanUrl(location && location.href);
  }

  function extractVisibleNote(document, location) {
    const currentUrl = cleanUrl(location && location.href);
    if (!isSupportedNoteUrl(currentUrl)) {
      return { ready: false, reason: 'not-note-page' };
    }
    const canonicalMatchesCurrent = hasMatchingCanonical(document, location);
    const openGraphType = queryMeta(document, 'meta[property="og:type"]').toLowerCase();
    if ((canonicalMatchesCurrent && openGraphType.includes('video')) || queryFirstVisibleElement(document, ['video', '.video-player'])) {
      return { ready: false, reason: 'video-unsupported' };
    }

    const title = queryFirstText(document, TITLE_SELECTORS);
    if (!title) {
      return { ready: false, reason: 'note-not-ready' };
    }

    const bodyText = queryFirstText(document, BODY_SELECTORS)
      || (canonicalMatchesCurrent ? queryMeta(document, 'meta[property="og:description"]') : '');
    const author = queryFirstText(document, AUTHOR_SELECTORS)
      || (canonicalMatchesCurrent ? queryMeta(document, 'meta[name="author"]') : '');
    const imageUrls = queryImages(document);
    const metadataImages = canonicalMatchesCurrent
      ? queryMetaValues(document, 'meta[property="og:image"]')
      : [];
    const metadataCover = metadataImages[metadataImages.length - 1] || '';
    if (!imageUrls.length && metadataCover) {
      imageUrls.push(metadataCover);
    }
    const coverUrl = imageUrls[0] || metadataCover;
    const capture = {
      sourceUrl: getSourceUrl(document, location),
      openUrl: getOpenUrl(document, location),
      sourceType: 'detail',
      title,
      author,
      bodyText,
      coverUrl,
      imageUrls,
    };
    capture.missingFields = ['author', 'bodyText', 'coverUrl'].filter((field) => !capture[field]);

    return { ready: true, capture };
  }

  return {
    extractVisibleNote,
    isSupportedNoteUrl,
  };
}));
