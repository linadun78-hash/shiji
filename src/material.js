(function exposeMaterialApi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsMaterial = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMaterialApi() {
  const OPTIONAL_CAPTURE_FIELDS = ['author', 'bodyText', 'coverUrl'];

  function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function cleanUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function getContentHash(title, bodyText) {
    const input = `${cleanText(title)}\n${cleanText(bodyText)}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `v1-${hash.toString(16).padStart(8, '0')}`;
  }

  function sanitizeSourceUrl(sourceUrl) {
    const value = cleanUrl(sourceUrl);
    if (!value) {
      return '';
    }
    try {
      const parsed = new URL(value);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    } catch (_error) {
      return value.split(/[?#]/, 1)[0];
    }
  }

  function sanitizeOpenUrl(openUrl, fallbackUrl) {
    const value = cleanUrl(openUrl || fallbackUrl);
    if (!value) {
      return '';
    }
    try {
      const parsed = new URL(value);
      const allowedParams = ['xsec_token', 'xsec_source'];
      const query = allowedParams
        .filter((name) => parsed.searchParams.has(name))
        .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(parsed.searchParams.get(name))}`)
        .join('&');
      return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`.replace(/\/$/, '');
    } catch (_error) {
      return value.split('#', 1)[0];
    }
  }

  function getSourceKey(sourceUrl) {
    const value = cleanUrl(sourceUrl);
    if (!value) {
      throw new Error('sourceUrl is required');
    }

    try {
      const parsed = new URL(value);
      const noteMatch = parsed.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/i);
      if (noteMatch) {
        return `xhs:${noteMatch[1]}`;
      }
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    } catch (_error) {
      return value.split(/[?#]/, 1)[0];
    }
  }

  function createMaterial(extraction, taskId, capturedAt) {
    const data = extraction || {};
    if (!cleanText(taskId)) {
      throw new Error('taskId is required');
    }

    const sourceUrl = sanitizeSourceUrl(data.sourceUrl);
    const openUrl = sanitizeOpenUrl(data.openUrl, data.sourceUrl);
    const title = cleanText(data.title);
    if (!sourceUrl) {
      throw new Error('sourceUrl is required');
    }
    if (!title) {
      throw new Error('title is required');
    }

    const author = cleanText(data.author);
    const bodyText = cleanText(data.bodyText);
    const coverUrl = cleanUrl(data.coverUrl);
    const imageUrls = Array.isArray(data.imageUrls)
      ? Array.from(new Set(data.imageUrls.map(cleanUrl).filter(Boolean)))
      : [];
    const normalized = { author, bodyText, coverUrl };
    const missingFields = OPTIONAL_CAPTURE_FIELDS.filter((field) => !normalized[field]);
    const pageSignature = getSourceKey(sourceUrl);
    const timestamp = capturedAt || new Date().toISOString();

    return {
      id: `${taskId}:${pageSignature}`,
      taskId,
      sourceUrl,
      sourceType: cleanText(data.sourceType) || 'detail',
      openUrl,
      title,
      author,
      bodyText,
      contentHash: getContentHash(title, bodyText),
      coverUrl,
      imageUrls,
      captureStatus: missingFields.length ? 'partial' : 'complete',
      missingFields,
      capturedAt: timestamp,
      pageSignature,
    };
  }

  function upsertMaterial(materials, incoming) {
    const list = Array.isArray(materials) ? materials.slice() : [];
    const index = list.findIndex((item) => (
      item.taskId === incoming.taskId && item.pageSignature === incoming.pageSignature
    ));
    if (index === -1) {
      list.push(incoming);
      return { materials: list, action: 'created' };
    }
    const existing = list[index];
    const merged = {
      ...existing,
      ...incoming,
      author: incoming.author || existing.author || '',
      bodyText: incoming.bodyText || existing.bodyText || '',
      coverUrl: incoming.coverUrl || existing.coverUrl || '',
      imageUrls: incoming.imageUrls && incoming.imageUrls.length
        ? incoming.imageUrls
        : (existing.imageUrls || []),
    };
    merged.missingFields = OPTIONAL_CAPTURE_FIELDS.filter((field) => !merged[field]);
    merged.captureStatus = merged.missingFields.length ? 'partial' : 'complete';
    merged.contentHash = getContentHash(merged.title, merged.bodyText);
    list[index] = merged;
    return { materials: list, action: 'updated' };
  }

  return {
    cleanText,
    createMaterial,
    getContentHash,
    getSourceKey,
    sanitizeSourceUrl,
    sanitizeOpenUrl,
    upsertMaterial,
  };
}));
