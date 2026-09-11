(function exposeTutorialManualRepository(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsTutorialManualRepository = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const MANUAL_STATE_KEY = 'xhsTutorialManualState';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeGoal(value) {
    return normalizeText(value).toLocaleLowerCase();
  }

  function shortText(value, limit = 24) {
    const text = normalizeText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(1, limit - 1))}…`;
  }

  function itemText(item) {
    return normalizeText(typeof item === 'string' ? item : item?.text);
  }

  function createTutorialManualTitle(goal, report, now = () => new Date().toISOString()) {
    const main = shortText(goal, 32);
    const phrases = [];
    ['themes', 'nextActions', 'preflightActions'].forEach((field) => {
      (Array.isArray(report?.[field]) ? report[field] : []).forEach((item) => {
        const text = shortText(itemText(item), 22);
        if (text && !phrases.includes(text) && phrases.length < 2) phrases.push(text);
      });
    });
    const base = main || `手册 · ${String(now()).slice(0, 10)}`;
    return phrases.length ? shortText(`${base}｜${phrases.join('、')}`, 56) : base;
  }

  function normalize(candidate) {
    if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.manuals)) {
      return { version: 1, manuals: [] };
    }
    return clone(candidate);
  }

  function createKey(snapshot) {
    const ids = Array.isArray(snapshot.selectedMaterialIds)
      ? [...new Set(snapshot.selectedMaterialIds.map(String))].sort()
      : [];
    return `${String(snapshot.taskId || '')}\u0000${normalizeGoal(snapshot.goal)}\u0000${ids.join(',')}`;
  }

  function createId(timestamp) {
    return `manual-${String(timestamp).replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createTutorialManualRepository(storage, options = {}) {
    const now = options.now || (() => new Date().toISOString());
    let state = { version: 1, manuals: [] };
    let writeTail = Promise.resolve();

    async function load() {
      const stored = await storage.get(MANUAL_STATE_KEY);
      return normalize(stored[MANUAL_STATE_KEY]);
    }

    async function initialize() {
      state = await load();
      await storage.set({ [MANUAL_STATE_KEY]: state });
      return clone(state);
    }

    async function reload() {
      state = await load();
      return clone(state);
    }

    function mutate(mutator) {
      const operation = writeTail.then(async () => {
        const draft = await load();
        const result = mutator(draft);
        await storage.set({ [MANUAL_STATE_KEY]: draft });
        state = draft;
        return clone(result);
      });
      writeTail = operation.catch(() => undefined);
      return operation;
    }

    function list() {
      return clone([...state.manuals].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))));
    }

    function get(id) {
      return clone(state.manuals.find((manual) => manual.id === id) || null);
    }

    function save(snapshot) {
      if (!snapshot?.reportPreset || snapshot?.status === 'failed') {
        return Promise.reject(new Error('只有成功的报告可以保存到手册'));
      }
      return mutate((draft) => {
        const key = createKey(snapshot);
        const existing = draft.manuals.find((manual) => manual.key === key);
        const timestamp = now();
        const next = {
          ...clone(snapshot),
          id: existing?.id || createId(timestamp),
          key,
          title: createTutorialManualTitle(snapshot.goal, snapshot.report, now),
          reportPreset: snapshot.reportPreset,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        draft.manuals = draft.manuals.filter((manual) => manual.id !== existing?.id);
        draft.manuals.push(next);
        return next;
      });
    }

    function remove(id) {
      return mutate((draft) => {
        const before = draft.manuals.length;
        draft.manuals = draft.manuals.filter((manual) => manual.id !== id);
        return draft.manuals.length !== before;
      });
    }

    return { get, initialize, list, reload, remove, save };
  }

  return { MANUAL_STATE_KEY, createTutorialManualRepository, createTutorialManualTitle };
}));
