(function exposeRepositoryApi(root, factory) {
  const materialApi = typeof module === 'object' && module.exports
    ? require('./material.js')
    : root.XhsMaterial;
  const api = factory(materialApi);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsRepository = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRepositoryApi(materialApi) {
  const STATE_KEY = 'xhsCollectorState';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function cleanTaskName(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function createMemoryStorage(initial = {}) {
    const data = clone(initial);
    return {
      async get(key) {
        return { [key]: clone(data[key]) };
      },
      async set(values) {
        Object.assign(data, clone(values));
      },
    };
  }

  function createChromeStorageAdapter(storageArea, runtime) {
    if (!storageArea) {
      throw new Error('chrome.storage.local is unavailable');
    }
    return {
      get(key) {
        return new Promise((resolve, reject) => {
          storageArea.get(key, (result) => {
            const error = runtime && runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            resolve(result || {});
          });
        });
      },
      set(values) {
        return new Promise((resolve, reject) => {
          storageArea.set(values, () => {
            const error = runtime && runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            resolve();
          });
        });
      },
    };
  }

  function createRepository(storage, options = {}) {
    if (!materialApi) {
      throw new Error('material API is unavailable');
    }
    const now = options.now || (() => new Date().toISOString());
    const lock = options.lock || (async (operation) => operation());
    const idFactory = options.idFactory || (() => (
      `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    ));
    let state = null;

    function requireState() {
      if (!state) {
        throw new Error('repository is not initialized');
      }
      return state;
    }

    function normalizeStoredState(candidate) {
      if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.tasks) || !candidate.tasks.length) {
        return null;
      }
      const normalized = {
        version: 1,
        currentTaskId: candidate.currentTaskId,
        tasks: clone(candidate.tasks),
        materials: Array.isArray(candidate.materials)
          ? candidate.materials.map((item) => ({
            ...clone(item),
            contentHash: item.contentHash
              || materialApi.getContentHash(item.title || '', item.bodyText || ''),
          }))
          : [],
      };
      if (!normalized.tasks.some((task) => task.id === normalized.currentTaskId)) {
        normalized.currentTaskId = normalized.tasks[0].id;
      }
      return normalized;
    }

    async function loadStoredState() {
      const stored = await storage.get(STATE_KEY);
      return normalizeStoredState(stored && stored[STATE_KEY]);
    }

    async function persist(nextState) {
      await storage.set({ [STATE_KEY]: nextState });
      state = nextState;
      return clone(state);
    }

    async function mutate(mutator) {
      return lock(async () => {
        const latest = await loadStoredState();
        const draft = clone(latest || requireState());
        const result = mutator(draft);
        await persist(draft);
        return clone(result);
      });
    }

    async function initialize() {
      const stored = await loadStoredState();
      if (stored) {
        state = stored;
        return clone(state);
      }

      const task = {
        id: idFactory(),
        name: '我的素材任务',
        createdAt: now(),
      };
      const initialState = {
        version: 1,
        currentTaskId: task.id,
        tasks: [task],
        materials: [],
      };
      return persist(initialState);
    }

    async function reload() {
      const latest = await loadStoredState();
      if (latest) {
        state = latest;
      }
      return getState();
    }

    function getState() {
      return clone(requireState());
    }

    function listMaterials(taskId) {
      return clone(requireState().materials.filter((item) => item.taskId === taskId));
    }

    async function createTask(name) {
      const normalized = cleanTaskName(name);
      if (!normalized) {
        throw new Error('任务名称不能为空');
      }
      const task = { id: idFactory(), name: normalized, createdAt: now() };
      return mutate((draft) => {
        draft.tasks.push(task);
        draft.currentTaskId = task.id;
        return task;
      });
    }

    async function selectTask(taskId) {
      await mutate((draft) => {
        if (!draft.tasks.some((task) => task.id === taskId)) {
          throw new Error('任务不存在');
        }
        draft.currentTaskId = taskId;
      });
      return getState();
    }

    async function renameTask(taskId, name) {
      const normalized = cleanTaskName(name);
      if (!normalized) {
        throw new Error('任务名称不能为空');
      }
      return mutate((draft) => {
        const task = draft.tasks.find((item) => item.id === taskId);
        if (!task) {
          throw new Error('任务不存在');
        }
        task.name = normalized;
        return task;
      });
    }

    async function capture(extraction) {
      return mutate((draft) => {
        const material = materialApi.createMaterial(extraction, draft.currentTaskId, now());
        const result = materialApi.upsertMaterial(draft.materials, material);
        draft.materials = result.materials;
        return { action: result.action, material };
      });
    }

    async function removeMaterial(materialId) {
      await mutate((draft) => {
        draft.materials = draft.materials.filter((item) => item.id !== materialId);
      });
      return getState();
    }

    async function clearTask(taskId) {
      await mutate((draft) => {
        draft.materials = draft.materials.filter((item) => item.taskId !== taskId);
      });
      return getState();
    }

    return {
      capture,
      clearTask,
      createTask,
      getState,
      initialize,
      listMaterials,
      reload,
      removeMaterial,
      renameTask,
      selectTask,
    };
  }

  return {
    STATE_KEY,
    createChromeStorageAdapter,
    createMemoryStorage,
    createRepository,
  };
}));
