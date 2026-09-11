const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMemoryStorage,
  createRepository,
} = require('../src/repository.js');

function setup(initialState) {
  let nextId = 1;
  const storage = createMemoryStorage(initialState ? { xhsCollectorState: initialState } : {});
  const repository = createRepository(storage, {
    now: () => '2026-08-08T10:00:00.000Z',
    idFactory: () => `task-${nextId++}`,
  });
  return { repository, storage };
}

test('creates and persists a default task on first use', async () => {
  const { repository, storage } = setup();

  const state = await repository.initialize();
  const stored = await storage.get('xhsCollectorState');

  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].name, '我的素材任务');
  assert.equal(state.currentTaskId, state.tasks[0].id);
  assert.equal(stored.xhsCollectorState.version, 1);
});

test('creates, selects, and renames a task', async () => {
  const { repository } = setup();
  await repository.initialize();

  const created = await repository.createTask(' 广州两日游 ');
  await repository.renameTask(created.id, '广州周末计划');
  const state = repository.getState();

  assert.equal(state.currentTaskId, created.id);
  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks.find((task) => task.id === created.id).name, '广州周末计划');
});

test('rejects blank task names and unknown task selections', async () => {
  const { repository } = setup();
  await repository.initialize();

  await assert.rejects(() => repository.createTask('   '), /任务名称/);
  await assert.rejects(() => repository.selectTask('missing'), /任务不存在/);
});

test('captures and updates materials inside the current task', async () => {
  const { repository } = setup();
  const state = await repository.initialize();

  const created = await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    title: '旧标题',
    sourceType: 'detail',
  });
  const updated = await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new',
    title: '新标题',
    author: '作者',
    bodyText: '正文',
    coverUrl: 'https://sns-img.example/cover.jpg',
    sourceType: 'detail',
  });

  assert.equal(created.action, 'created');
  assert.equal(updated.action, 'updated');
  assert.equal(repository.listMaterials(state.currentTaskId).length, 1);
  assert.equal(repository.listMaterials(state.currentTaskId)[0].title, '新标题');
});

test('keeps material lists separated by task', async () => {
  const { repository } = setup();
  const initial = await repository.initialize();
  await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/one',
    title: '任务一素材',
    sourceType: 'detail',
  });
  const second = await repository.createTask('教程整理');
  await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/two',
    title: '任务二素材',
    sourceType: 'detail',
  });

  assert.equal(repository.listMaterials(initial.currentTaskId).length, 1);
  assert.equal(repository.listMaterials(second.id).length, 1);
});

test('removes one material and clears only the selected task', async () => {
  const { repository } = setup();
  const initial = await repository.initialize();
  const first = await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/one',
    title: '第一条',
    sourceType: 'detail',
  });
  await repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/two',
    title: '第二条',
    sourceType: 'detail',
  });

  await repository.removeMaterial(first.material.id);
  assert.equal(repository.listMaterials(initial.currentTaskId).length, 1);

  await repository.clearTask(initial.currentTaskId);
  assert.equal(repository.listMaterials(initial.currentTaskId).length, 0);
});

test('restores a previously persisted state', async () => {
  const initialState = {
    version: 1,
    currentTaskId: 'saved-task',
    tasks: [{ id: 'saved-task', name: '已保存任务', createdAt: '2026-08-01T00:00:00.000Z' }],
    materials: [{ id: 'saved-material', taskId: 'saved-task', title: '已保存素材' }],
  };
  const { repository } = setup(initialState);

  const state = await repository.initialize();

  assert.equal(state.currentTaskId, 'saved-task');
  assert.equal(repository.listMaterials('saved-task')[0].title, '已保存素材');
});

test('backfills content hash when loading legacy raw material', async () => {
  const initialState = {
    version: 1,
    currentTaskId: 'saved-task',
    tasks: [{ id: 'saved-task', name: '旧任务', createdAt: '2026-08-01T00:00:00.000Z' }],
    materials: [{
      id: 'saved-material',
      taskId: 'saved-task',
      pageSignature: 'xhs:old',
      title: '旧标题',
      bodyText: '旧正文',
      sourceUrl: 'https://www.xiaohongshu.com/explore/old',
    }],
  };
  const { repository } = setup(initialState);
  await repository.initialize();
  assert.match(repository.getState().materials[0].contentHash, /^v1-[0-9a-f]{8}$/);
});

test('rebases mutations on the latest storage state across two tabs', async () => {
  const storage = createMemoryStorage();
  const options = {
    now: () => '2026-08-08T10:00:00.000Z',
    idFactory: (() => {
      let id = 1;
      return () => `task-${id++}`;
    })(),
  };
  const tabA = createRepository(storage, options);
  const tabB = createRepository(storage, options);
  await tabA.initialize();
  await tabB.initialize();

  await tabA.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/from-a',
    title: '标签页 A',
    sourceType: 'detail',
  });
  await tabB.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/from-b',
    title: '标签页 B',
    sourceType: 'detail',
  });
  await tabA.reload();

  assert.deepEqual(
    tabA.listMaterials(tabA.getState().currentTaskId).map((item) => item.title).sort(),
    ['标签页 A', '标签页 B'],
  );
});

test('keeps in-memory state unchanged when persistence fails', async () => {
  const memory = createMemoryStorage();
  let rejectWrites = false;
  const storage = {
    get: (key) => memory.get(key),
    set: async (values) => {
      if (rejectWrites) {
        throw new Error('quota exceeded');
      }
      return memory.set(values);
    },
  };
  const repository = createRepository(storage, {
    now: () => '2026-08-08T10:00:00.000Z',
    idFactory: () => 'task-1',
  });
  await repository.initialize();
  rejectWrites = true;

  await assert.rejects(() => repository.capture({
    sourceUrl: 'https://www.xiaohongshu.com/explore/rejected',
    title: '不应留在内存',
    sourceType: 'detail',
  }), /quota exceeded/);

  assert.equal(repository.listMaterials('task-1').length, 0);
});

test('serializes simultaneous tab writes with a shared lock', async () => {
  const storage = createMemoryStorage();
  let lockTail = Promise.resolve();
  const sharedLock = async (operation) => {
    const result = lockTail.then(operation, operation);
    lockTail = result.catch(() => undefined);
    return result;
  };
  const options = {
    now: () => '2026-08-08T10:00:00.000Z',
    idFactory: (() => {
      let id = 1;
      return () => `task-${id++}`;
    })(),
    lock: sharedLock,
  };
  const tabA = createRepository(storage, options);
  const tabB = createRepository(storage, options);
  await tabA.initialize();
  await tabB.initialize();

  await Promise.all([
    tabA.capture({
      sourceUrl: 'https://www.xiaohongshu.com/explore/concurrent-a',
      title: '并发 A',
      sourceType: 'detail',
    }),
    tabB.capture({
      sourceUrl: 'https://www.xiaohongshu.com/explore/concurrent-b',
      title: '并发 B',
      sourceType: 'detail',
    }),
  ]);
  await tabA.reload();

  assert.deepEqual(
    tabA.listMaterials(tabA.getState().currentTaskId).map((item) => item.title).sort(),
    ['并发 A', '并发 B'],
  );
});
