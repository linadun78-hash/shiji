const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractVisibleNote,
  isSupportedNoteUrl,
} = require('../src/xhs-adapter.js');

function element({ text = '', attrs = {}, src = '', hidden = false } = {}) {
  return {
    textContent: text,
    src,
    hidden,
    getAttribute(name) {
      return attrs[name] || '';
    },
  };
}

function fakeDocument(single = {}, multiple = {}) {
  return {
    querySelector(selector) {
      return single[selector] || (multiple[selector] && multiple[selector][0]) || null;
    },
    querySelectorAll(selector) {
      return multiple[selector] || (single[selector] ? [single[selector]] : []);
    },
  };
}

test('recognizes supported Xiaohongshu detail URLs', () => {
  assert.equal(isSupportedNoteUrl('https://www.xiaohongshu.com/explore/abc123'), true);
  assert.equal(isSupportedNoteUrl('https://www.xiaohongshu.com/discovery/item/xyz789?x=1'), true);
  assert.equal(isSupportedNoteUrl('https://www.xiaohongshu.com/explore'), false);
  assert.equal(isSupportedNoteUrl('https://example.com/explore/abc123'), false);
});

test('extracts real values from a visible detail-page DOM', () => {
  const document = fakeDocument({
    '#detail-title': element({ text: ' 广州两日游路线 ' }),
    '#detail-desc': element({ text: ' 第一天从陈家祠出发。\n第二天去沙面。 ' }),
    '.author-wrapper .username': element({ text: '旅行者小林' }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/abc123' } }),
  }, {
    '#noteContainer .note-slider-img': [
      element({ src: 'https://sns-img.example/one.jpg' }),
      element({ src: 'https://sns-img.example/two.jpg' }),
    ],
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=one' });

  assert.equal(result.ready, true);
  assert.equal(result.capture.title, '广州两日游路线');
  assert.equal(result.capture.author, '旅行者小林');
  assert.equal(result.capture.bodyText, '第一天从陈家祠出发。 第二天去沙面。');
  assert.equal(result.capture.coverUrl, 'https://sns-img.example/one.jpg');
  assert.deepEqual(result.capture.imageUrls, [
    'https://sns-img.example/one.jpg',
    'https://sns-img.example/two.jpg',
  ]);
  assert.equal(result.capture.sourceUrl, 'https://www.xiaohongshu.com/explore/abc123');
  assert.equal(result.capture.openUrl, 'https://www.xiaohongshu.com/explore/abc123?xsec_token=one');
});

test('extracts a detail modal that uses current generic note selectors', () => {
  const document = fakeDocument({
    '.note-title': element({ text: '希望有半框眼镜卷毛小帅' }),
    '[class*="note-desc"]': element({ text: '来加爆我的微信' }),
    '.user-name': element({ text: '番茄小面^' }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/modal123' } }),
  }, {
    '.note-content img': [element({ src: 'https://sns-img.example/modal.jpg' })],
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/modal123' });

  assert.equal(result.ready, true);
  assert.equal(result.capture.title, '希望有半框眼镜卷毛小帅');
  assert.equal(result.capture.bodyText, '来加爆我的微信');
  assert.equal(result.capture.author, '番茄小面^');
});

test('falls back to open graph metadata when content selectors are absent', () => {
  const document = fakeDocument({
    '#detail-title': element({ text: '元数据标题' }),
    'meta[property="og:title"]': element({ attrs: { content: '元数据标题' } }),
    'meta[property="og:description"]': element({ attrs: { content: '元数据正文' } }),
    'meta[name="author"]': element({ attrs: { content: '元数据作者' } }),
    'meta[property="og:image"]': element({ attrs: { content: 'https://sns-img.example/meta.jpg' } }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/meta123' } }),
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/meta123' });

  assert.equal(result.ready, true);
  assert.equal(result.capture.title, '元数据标题');
  assert.equal(result.capture.bodyText, '元数据正文');
  assert.equal(result.capture.author, '元数据作者');
  assert.equal(result.capture.coverUrl, 'https://sns-img.example/meta.jpg');
});

test('uses the last open graph image when the first metadata image is a site logo', () => {
  const document = fakeDocument({
    '#detail-title': element({ text: '图文笔记' }),
    'meta[property="og:title"]': element({ attrs: { content: '图文笔记' } }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/meta-cover' } }),
  }, {
    'meta[property="og:image"]': [
      element({ attrs: { content: 'https://static.example/xhs-logo.png' } }),
      element({ attrs: { content: 'https://sns-img.example/actual-cover.jpg' } }),
    ],
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/meta-cover' });

  assert.equal(result.capture.coverUrl, 'https://sns-img.example/actual-cover.jpg');
});

test('returns a partial capture without inventing unavailable fields', () => {
  const document = fakeDocument({
    '#detail-title': element({ text: '只读取到标题' }),
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/partial123' });

  assert.equal(result.ready, true);
  assert.equal(result.capture.title, '只读取到标题');
  assert.equal(result.capture.author, '');
  assert.equal(result.capture.bodyText, '');
  assert.deepEqual(result.capture.missingFields, ['author', 'bodyText', 'coverUrl']);
});

test('skips hidden stale nodes and reads the visible note after SPA navigation', () => {
  const hiddenTitle = element({ text: '上一条笔记', hidden: true });
  const visibleTitle = element({ text: '当前笔记' });
  const hiddenAuthor = element({ text: '旧作者', attrs: { 'aria-hidden': 'true' } });
  const visibleAuthor = element({ text: '当前作者' });
  const hiddenImage = element({ src: 'https://sns-img.example/old.jpg', hidden: true });
  const visibleImage = element({ src: 'https://sns-img.example/current.jpg' });
  const document = fakeDocument({}, {
    '#detail-title': [hiddenTitle, visibleTitle],
    '.author-wrapper .username': [hiddenAuthor, visibleAuthor],
    '#noteContainer .note-slider-img': [hiddenImage, visibleImage],
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/current123' });

  assert.equal(result.capture.title, '当前笔记');
  assert.equal(result.capture.author, '当前作者');
  assert.deepEqual(result.capture.imageUrls, ['https://sns-img.example/current.jpg']);
});

test('does not capture a list page or a detail page without a title', () => {
  const listResult = extractVisibleNote(fakeDocument(), { href: 'https://www.xiaohongshu.com/explore' });
  const emptyDetail = extractVisibleNote(fakeDocument(), { href: 'https://www.xiaohongshu.com/explore/empty123' });

  assert.equal(listResult.ready, false);
  assert.equal(listResult.reason, 'not-note-page');
  assert.equal(emptyDetail.ready, false);
  assert.equal(emptyDetail.reason, 'note-not-ready');
});

test('does not use stale head metadata when the canonical note is from another page', () => {
  const document = fakeDocument({
    'meta[property="og:title"]': element({ attrs: { content: '上一条笔记标题' } }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/previous123' } }),
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/current123' });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'note-not-ready');
});

test('rejects video notes in the image-text-only foundation release', () => {
  const document = fakeDocument({
    'video': element(),
    '#detail-title': element({ text: '视频笔记' }),
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/video123' });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'video-unsupported');
});

test('rejects a video note declared through open graph metadata', () => {
  const document = fakeDocument({
    'meta[property="og:type"]': element({ attrs: { content: 'video.other' } }),
    'meta[property="og:title"]': element({ attrs: { content: '视频元数据标题' } }),
    '#detail-title': element({ text: '视频元数据标题' }),
    'link[rel="canonical"]': element({ attrs: { href: 'https://www.xiaohongshu.com/explore/video-meta' } }),
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/video-meta' });

  assert.equal(result.ready, false);
  assert.equal(result.reason, 'video-unsupported');
});

test('deduplicates repeated image URLs', () => {
  const duplicate = element({ src: 'https://sns-img.example/same.jpg' });
  const document = fakeDocument({
    '#detail-title': element({ text: '图片去重' }),
  }, {
    '#noteContainer .note-slider-img': [duplicate, duplicate],
  });

  const result = extractVisibleNote(document, { href: 'https://www.xiaohongshu.com/explore/image123' });

  assert.deepEqual(result.capture.imageUrls, ['https://sns-img.example/same.jpg']);
});
