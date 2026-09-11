const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMaterial,
  getContentHash,
  getSourceKey,
  upsertMaterial,
} = require('../src/material.js');

test('creates the same content hash for whitespace-equivalent text', () => {
  assert.equal(
    getContentHash(' 标题 ', '第一段\n第二段'),
    getContentHash('标题', '第一段 第二段'),
  );
  assert.match(getContentHash('标题', '正文'), /^v1-[0-9a-f]{8}$/);
});

test('stores content hash on every captured material', () => {
  const material = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/hash-note',
    title: '标题',
    bodyText: '正文',
  }, 'task-1', '2026-08-09T10:00:00.000Z');
  assert.equal(material.contentHash, getContentHash('标题', '正文'));
  assert.equal('analysisStatus' in material, false);
});

test('creates a complete material when every visible field is present', () => {
  const material = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret',
    title: '广州两日游路线',
    author: '旅行者小林',
    bodyText: '第一天从陈家祠出发。',
    coverUrl: 'https://sns-img.example/cover.jpg',
    imageUrls: ['https://sns-img.example/cover.jpg'],
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T10:00:00.000Z');

  assert.equal(material.captureStatus, 'complete');
  assert.deepEqual(material.missingFields, []);
  assert.equal(material.taskId, 'task-1');
  assert.equal(material.pageSignature, 'xhs:abc123');
  assert.equal(
    material.openUrl,
    'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret',
  );
});

test('keeps missing fields explicit for a partial capture', () => {
  const material = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/partial-note',
    title: '只读取到标题',
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T10:00:00.000Z');

  assert.equal(material.captureStatus, 'partial');
  assert.deepEqual(material.missingFields, ['author', 'bodyText', 'coverUrl']);
  assert.deepEqual(material.imageUrls, []);
});

test('rejects captures without a task, source URL, or title', () => {
  assert.throws(() => createMaterial({ sourceUrl: 'https://www.xiaohongshu.com/explore/a' }, ''), /taskId/);
  assert.throws(() => createMaterial({ title: '标题' }, 'task-1'), /sourceUrl/);
  assert.throws(() => createMaterial({ sourceUrl: 'https://www.xiaohongshu.com/explore/a' }, 'task-1'), /title/);
});

test('uses the stable note id instead of tracking query parameters', () => {
  assert.equal(
    getSourceKey('https://www.xiaohongshu.com/explore/abc123?xsec_token=one&xsec_source=pc_feed'),
    'xhs:abc123',
  );
  assert.equal(
    getSourceKey('https://www.xiaohongshu.com/discovery/item/xyz789?foo=bar'),
    'xhs:xyz789',
  );
});

test('removes tracking and access parameters before persisting a source URL', () => {
  const material = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret&xsec_source=pc_feed#comment',
    title: '隐私链接',
    sourceType: 'detail',
  }, 'task-1');

  assert.equal(material.sourceUrl, 'https://www.xiaohongshu.com/explore/abc123');
  assert.equal(material.openUrl, 'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret&xsec_source=pc_feed');
});

test('keeps a local-only replay URL with the minimum access parameters', () => {
  const material = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    openUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret&xsec_source=pc_feed&tracking_id=drop-me',
    title: '回看链接',
    sourceType: 'detail',
  }, 'task-1');

  assert.equal(
    material.openUrl,
    'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret&xsec_source=pc_feed',
  );
  assert.equal(material.sourceUrl, 'https://www.xiaohongshu.com/explore/abc123');
});

test('updates a repeated capture in the same task without increasing count', () => {
  const first = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    title: '旧标题',
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T10:00:00.000Z');
  const refreshed = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new',
    title: '新标题',
    author: '作者',
    bodyText: '正文',
    coverUrl: 'https://sns-img.example/cover.jpg',
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T11:00:00.000Z');

  const result = upsertMaterial([first], refreshed);

  assert.equal(result.materials.length, 1);
  assert.equal(result.action, 'updated');
  assert.equal(result.materials[0].title, '新标题');
  assert.equal(result.materials[0].captureStatus, 'complete');
});

test('preserves previously captured content when a later page read is partial', () => {
  const complete = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    openUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=old',
    title: '完整标题',
    author: '原作者',
    bodyText: '已经成功读取的完整正文',
    coverUrl: 'https://sns-img.example/old-cover.jpg',
    imageUrls: ['https://sns-img.example/old-1.jpg'],
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T10:00:00.000Z');
  const partial = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    openUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new',
    title: '更新后的标题',
    sourceType: 'detail',
  }, 'task-1', '2026-08-08T11:00:00.000Z');

  const result = upsertMaterial([complete], partial);
  const merged = result.materials[0];

  assert.equal(merged.title, '更新后的标题');
  assert.equal(merged.author, '原作者');
  assert.equal(merged.bodyText, '已经成功读取的完整正文');
  assert.equal(merged.coverUrl, 'https://sns-img.example/old-cover.jpg');
  assert.deepEqual(merged.imageUrls, ['https://sns-img.example/old-1.jpg']);
  assert.equal(merged.openUrl, 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new');
  assert.equal(merged.capturedAt, '2026-08-08T11:00:00.000Z');
  assert.equal(merged.captureStatus, 'complete');
  assert.deepEqual(merged.missingFields, []);
  assert.equal(merged.contentHash, getContentHash('更新后的标题', '已经成功读取的完整正文'));
});

test('allows the same source to belong to two different tasks', () => {
  const first = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    title: '广州路线',
    sourceType: 'detail',
  }, 'task-1');
  const second = createMaterial({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    title: '广州路线',
    sourceType: 'detail',
  }, 'task-2');

  const result = upsertMaterial([first], second);

  assert.equal(result.materials.length, 2);
  assert.equal(result.action, 'created');
});
