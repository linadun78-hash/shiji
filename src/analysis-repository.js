(function exposeAnalysisRepository(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsAnalysisRepository = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const ANALYSIS_STATE_KEY = 'xhsAnalysisState';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createAnalysisRepository(storage, options = {}) {
    const now = options.now || (() => new Date().toISOString());
    let state = null;
    let writeTail = Promise.resolve();

    function normalize(candidate) {
      if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.records)) {
        return { version: 1, enabled: false, consentedAt: '', records: [] };
      }
      return clone(candidate);
    }

    async function load() {
      const stored = await storage.get(ANALYSIS_STATE_KEY);
      return normalize(stored[ANALYSIS_STATE_KEY]);
    }

    async function initialize() {
      state = await load();
      await storage.set({ [ANALYSIS_STATE_KEY]: state });
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
        await storage.set({ [ANALYSIS_STATE_KEY]: draft });
        state = draft;
        return clone(result);
      });
      writeTail = operation.catch(() => undefined);
      return operation;
    }

    function getState() {
      return clone(state);
    }

    function getRecord(materialId) {
      return clone(state.records.find((item) => item.materialId === materialId) || null);
    }

    function ensureMaterial(material) {
      return mutate((draft) => {
        const existing = draft.records.find((item) => item.materialId === material.id);
        if (existing && existing.contentHash === material.contentHash) return existing;
        const next = {
          materialId: material.id,
          contentHash: material.contentHash,
          status: 'pending',
          error: null,
          brief: null,
          revision: existing ? existing.revision + 1 : 1,
          updatedAt: now(),
        };
        draft.records = draft.records.filter((item) => item.materialId !== material.id);
        draft.records.push(next);
        return next;
      });
    }

    function enable(consentedAt) {
      return mutate((draft) => {
        draft.enabled = true;
        draft.consentedAt = consentedAt || now();
        return { enabled: draft.enabled, consentedAt: draft.consentedAt };
      });
    }

    function updateRecord(materialId, expectedHash, updater, expectedRevision) {
      return mutate((draft) => {
        const record = draft.records.find((item) => item.materialId === materialId);
        if (!record || record.contentHash !== expectedHash) return false;
        if (expectedRevision !== undefined && record.revision !== expectedRevision) return false;
        updater(record);
        record.updatedAt = now();
        return true;
      });
    }

    function markProcessing(materialId, expectedHash) {
      return mutate((draft) => {
        const record = draft.records.find((item) => item.materialId === materialId);
        if (!record || record.contentHash !== expectedHash) return false;
        if (!['pending', 'stale', 'failed'].includes(record.status)) return false;
        record.status = 'processing';
        record.error = null;
        record.revision += 1;
        record.updatedAt = now();
        return record;
      });
    }

    function applyResult(materialId, expectedHash, brief, expectedRevision) {
      return updateRecord(materialId, expectedHash, (record) => {
        record.status = 'succeeded';
        record.error = null;
        record.brief = clone(brief);
      }, expectedRevision);
    }

    function markInsufficient(materialId, expectedHash, message, expectedRevision) {
      return updateRecord(materialId, expectedHash, (record) => {
        record.status = 'insufficient';
        record.error = { code: 'insufficient_source', message, retryable: false };
        record.brief = null;
      }, expectedRevision);
    }

    function markFailed(materialId, expectedHash, error, expectedRevision) {
      return updateRecord(materialId, expectedHash, (record) => {
        record.status = 'failed';
        record.error = clone(error);
        record.brief = null;
      }, expectedRevision);
    }

    function retry(materialId) {
      const current = getRecord(materialId);
      if (!current) return Promise.resolve(false);
      return updateRecord(materialId, current.contentHash, (record) => {
        record.status = 'pending';
        record.error = null;
        record.revision += 1;
      });
    }

    function requeueInterrupted() {
      return mutate((draft) => {
        for (const record of draft.records) {
          if (record.status === 'processing') {
            record.status = 'pending';
            record.revision += 1;
            record.updatedAt = now();
          }
        }
      });
    }

    function pruneMissing(materialIds) {
      const allowed = new Set(materialIds);
      return mutate((draft) => {
        draft.records = draft.records.filter((record) => allowed.has(record.materialId));
      });
    }

    function getNextPending(materials) {
      const byId = new Map(materials.map((item) => [item.id, item]));
      return clone(state.records
        .filter((record) => ['pending', 'stale'].includes(record.status))
        .filter((record) => byId.get(record.materialId)?.contentHash === record.contentHash)
        .map((record) => byId.get(record.materialId))
        .sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)))[0] || null);
    }

    return {
      applyResult,
      enable,
      ensureMaterial,
      getNextPending,
      getRecord,
      getState,
      initialize,
      markFailed,
      markInsufficient,
      markProcessing,
      pruneMissing,
      requeueInterrupted,
      reload,
      retry,
    };
  }

  return { ANALYSIS_STATE_KEY, createAnalysisRepository };
}));
