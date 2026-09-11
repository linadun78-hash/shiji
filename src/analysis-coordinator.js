(function exposeCoordinator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XhsAnalysisCoordinator = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  function createAnalysisCoordinator({ materialRepository, analysisRepository, client }) {
    let queueTail = Promise.resolve();

    function enqueue(operation) {
      const result = queueTail.then(operation, operation);
      queueTail = result.catch(() => undefined);
      return result;
    }

    async function processOne(materialId) {
      const material = materialRepository.getState().materials.find((item) => item.id === materialId);
      if (!material) return false;
      const record = await analysisRepository.ensureMaterial(material);
      if (!['pending', 'stale', 'failed'].includes(record.status)) return false;
      const hash = material.contentHash;
      const started = await analysisRepository.markProcessing(material.id, hash);
      if (!started) return false;
      const revision = started && typeof started === 'object' ? started.revision : undefined;
      try {
        const response = await client.summarize(material);
        if (response.status === 'insufficient') {
          await analysisRepository.markInsufficient(material.id, hash, response.message, revision);
        } else {
          await analysisRepository.applyResult(material.id, hash, response.brief, revision);
        }
      } catch (error) {
        await analysisRepository.markFailed(material.id, hash, {
          code: error.code || 'analysis_failed',
          message: error.message || 'AI 整理失败',
          retryable: Boolean(error.retryable),
          diagnosticId: typeof error.diagnosticId === 'string' ? error.diagnosticId : '',
        }, revision);
      }
      return true;
    }

    function processMaterial(materialId) {
      return enqueue(() => processOne(materialId));
    }

    function drain() {
      return enqueue(async () => {
        while (analysisRepository.getState().enabled) {
          const next = analysisRepository.getNextPending(materialRepository.getState().materials);
          if (!next) break;
          await processOne(next.id);
        }
      });
    }

    function retryMaterial(materialId) {
      return enqueue(async () => {
        const retried = await analysisRepository.retry(materialId);
        if (!retried) return false;
        return processOne(materialId);
      });
    }

    function retryAll(materialIds) {
      const allowed = new Set(Array.isArray(materialIds) ? materialIds : []);
      return enqueue(async () => {
        const materials = materialRepository.getState().materials
          .filter((material) => allowed.has(material.id));
        for (const material of materials) {
          const record = await analysisRepository.ensureMaterial(material);
          if (record?.status === 'failed' && record.error?.retryable) {
            await analysisRepository.retry(material.id);
          }
        }
        let processed = 0;
        while (analysisRepository.getState().enabled) {
          const next = analysisRepository.getNextPending(materials);
          if (!next) break;
          if (await processOne(next.id)) processed += 1;
        }
        return processed;
      });
    }

    return { drain, processMaterial, retryAll, retryMaterial };
  }

  return { createAnalysisCoordinator };
}));
