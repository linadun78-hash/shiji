const test = require('node:test');
const assert = require('node:assert/strict');

const { createTutorialManualRepository } = require('../src/tutorial-manual-repository');

function createStorage(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  return {
    async get(key) { return { [key]: data[key] === undefined ? undefined : JSON.parse(JSON.stringify(data[key])) }; },
    async set(values) { Object.assign(data, JSON.parse(JSON.stringify(values))); },
  };
}

function sequence(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function makeSnapshot(overrides = {}) {
  return {
    taskId: 'task-1',
    goal: '我想学会安装这个应用',
    reportPreset: 'tutorial',
    report: {
      reportId: 'r1',
      themes: [{ text: '环境变量配置', citationIds: ['c1'] }],
      nextActions: [{ text: '启动应用', citationIds: ['c2'] }],
      preflightActions: [],
    },
    materials: [{ id: 'm1', title: '安装说明' }],
    selectedMaterialIds: ['m1'],
    sourceRevision: 'rev-1',
    ...overrides,
  };
}

test('saves a tutorial snapshot and derives a readable title', async () => {
  const storage = createStorage();
  const repository = createTutorialManualRepository(storage, { now: () => '2026-09-06T00:00:00.000Z' });
  await repository.initialize();
  const saved = await repository.save(makeSnapshot());
  assert.equal(saved.title, '我想学会安装这个应用｜环境变量配置、启动应用');
  assert.equal(repository.list().length, 1);
  assert.deepEqual(repository.get(saved.id).materials, [{ id: 'm1', title: '安装说明' }]);
});

test('updates identical task goal and material selection instead of duplicating', async () => {
  const storage = createStorage();
  const repository = createTutorialManualRepository(storage, { now: sequence('2026-09-06T00:00:00.000Z', '2026-09-06T01:00:00.000Z') });
  await repository.initialize();
  const first = await repository.save(makeSnapshot());
  const updated = await repository.save(makeSnapshot({ sourceRevision: 'rev-2', report: { reportId: 'r2' } }));
  assert.equal(repository.list().length, 1);
  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.sourceRevision, 'rev-2');
  assert.equal(updated.report.reportId, 'r2');
});

test('saves every report type and keeps stale snapshots available', async () => {
  for (const reportPreset of ['tutorial', 'travel', 'generic']) {
    const repository = createTutorialManualRepository(createStorage());
    await repository.initialize();
    const saved = await repository.save({ ...makeSnapshot(), reportPreset });
    assert.equal(saved.reportPreset, reportPreset);
  }
  const repository = createTutorialManualRepository(createStorage());
  await repository.initialize();
  const stale = await repository.save({ ...makeSnapshot(), status: 'stale' });
  assert.equal(stale.status, 'stale');
  await assert.rejects(repository.save({ ...makeSnapshot(), status: 'failed' }), /成功的报告/);
  assert.equal(repository.list().length, 1);
});

test('creates a separate manual when the command or selected materials change', async () => {
  const repository = createTutorialManualRepository(createStorage());
  await repository.initialize();
  await repository.save(makeSnapshot());
  await repository.save(makeSnapshot({ goal: '我想学会发布这个应用', selectedMaterialIds: ['m2'] }));
  assert.equal(repository.list().length, 2);
});

test('removes one manual without affecting the other snapshots', async () => {
  const repository = createTutorialManualRepository(createStorage());
  await repository.initialize();
  const first = await repository.save(makeSnapshot());
  const second = await repository.save(makeSnapshot({ goal: '我想学会发布这个应用' }));
  assert.equal(await repository.remove(first.id), true);
  assert.equal(repository.get(first.id), null);
  assert.equal(repository.get(second.id).goal, '我想学会发布这个应用');
  assert.equal(await repository.remove(first.id), false);
});

test('normalizes damaged persisted state to an empty manual library', async () => {
  const repository = createTutorialManualRepository(createStorage({ xhsTutorialManualState: { version: 9, manuals: 'bad' } }));
  const state = await repository.initialize();
  assert.deepEqual(state, { version: 1, manuals: [] });
  assert.deepEqual(repository.list(), []);
});

test('propagates local storage failures so the UI can isolate the error', async () => {
  const storage = {
    async get() { return {}; },
    async set() { throw new Error('storage unavailable'); },
  };
  const repository = createTutorialManualRepository(storage);
  await assert.rejects(repository.initialize(), /storage unavailable/);
});
