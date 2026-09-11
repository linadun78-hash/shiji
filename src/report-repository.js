(function exposeReportRepository(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsReportRepository = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const REPORT_STATE_KEY = 'xhsPurposeReportState';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalize(candidate) {
    if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.reports)) {
      return { version: 1, reports: [] };
    }
    return clone(candidate);
  }

  function createReportRepository(storage, options = {}) {
    const now = options.now || (() => new Date().toISOString());
    let state = null;
    let writeTail = Promise.resolve();

    async function load() {
      const stored = await storage.get(REPORT_STATE_KEY);
      return normalize(stored[REPORT_STATE_KEY]);
    }

    async function initialize() {
      state = await load();
      await storage.set({ [REPORT_STATE_KEY]: state });
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
        await storage.set({ [REPORT_STATE_KEY]: draft });
        state = draft;
        return clone(result);
      });
      writeTail = operation.catch(() => undefined);
      return operation;
    }

    function getReport(taskId) {
      return clone(state.reports.find((item) => item.taskId === taskId) || null);
    }

    function saveReport(taskId, report) {
      return mutate((draft) => {
        const next = {
          taskId,
          status: 'succeeded',
          error: null,
          updatedAt: now(),
          ...clone(report),
        };
        draft.reports = draft.reports.filter((item) => item.taskId !== taskId);
        draft.reports.push(next);
        return next;
      });
    }

    function markStale(taskId, currentRevision) {
      return mutate((draft) => {
        const report = draft.reports.find((item) => item.taskId === taskId);
        if (!report || report.sourceRevision === currentRevision) return false;
        report.status = 'stale';
        report.updatedAt = now();
        return true;
      });
    }

    return { getReport, initialize, markStale, reload, saveReport };
  }

  return { REPORT_STATE_KEY, createReportRepository };
}));
