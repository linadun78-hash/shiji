import './runtime-env.js';
import './runtime-config.js';
import './auth-client.js';
import './material.js';
import './repository.js';
import './analysis-repository.js';
import './analysis-client.js';
import './settings-client.js';
import './provider-settings.js';
import './provider-client.js';
import './direct-ai-client.js';
import './report-client.js';
import './analysis-coordinator.js';

const runtimeConfig = XhsRuntimeConfig.getRuntimeConfig();

function createAuthStorageAdapter(storageArea) {
  if (!storageArea) throw new Error('Chrome auth storage is unavailable');
  return {
    get(key) {
      return new Promise((resolve, reject) => {
        storageArea.get(key, (result) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result || {});
        });
      });
    },
    set(values) {
      return new Promise((resolve, reject) => {
        storageArea.set(values, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    },
    remove(keys) {
      return new Promise((resolve, reject) => {
        storageArea.remove(keys, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    },
  };
}

const authClient = XhsAuthClient.createAuthClient({
  config: runtimeConfig,
  identityApi: chrome.identity,
  sessionStore: createAuthStorageAdapter(chrome.storage.session),
  localStore: createAuthStorageAdapter(chrome.storage.local),
  fetchFn: fetch,
  cryptoApi: crypto,
});

async function apiFetch(url, options = {}) {
  if (runtimeConfig.mode !== 'cloud') {
    return fetch(url, options);
  }
  const accessToken = await authClient.getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...options, headers });
}

const storage = XhsRepository.createChromeStorageAdapter(chrome.storage.local, chrome.runtime);
const providerSettings = XhsProviderSettings.createProviderSettings(storage);
const providerClient = XhsProviderClient.createProviderClient({ fetchFn: fetch });
const directAiClient = XhsDirectAiClient.createDirectAiClient({
  complete: (config) => providerClient.complete(config),
});
const lock = typeof navigator !== 'undefined'
  && navigator.locks
  && typeof navigator.locks.request === 'function'
  ? (operation) => navigator.locks.request('xmc-storage-write', operation)
  : undefined;
const materialRepository = XhsRepository.createRepository(storage, { lock });
const analysisRepository = XhsAnalysisRepository.createAnalysisRepository(storage);
const localAnalysisClient = XhsAnalysisClient.createAnalysisClient({
  baseUrl: runtimeConfig.apiBaseUrl,
  fetchFn: apiFetch,
});
const client = {
  summarize: async (material) => {
    const mode = (await providerSettings.get()).mode;
    if (mode === 'direct') {
      const config = await providerSettings.getSecret('direct');
      return directAiClient.summarize(material, config);
    }
    return localAnalysisClient.summarize(material);
  },
};
const settingsClient = XhsSettingsClient.createSettingsClient({
  baseUrl: runtimeConfig.apiBaseUrl,
  fetchFn: apiFetch,
});
const localReportClient = XhsReportClient.createReportClient({
  baseUrl: runtimeConfig.apiBaseUrl,
  fetchFn: apiFetch,
});
const reportClient = {
  generate: async (values) => {
    const mode = (await providerSettings.get()).mode;
    if (mode === 'direct') {
      const config = await providerSettings.getSecret('direct');
      return directAiClient.generateReport(values, config);
    }
    return localReportClient.generate(values);
  },
};
const coordinator = XhsAnalysisCoordinator.createAnalysisCoordinator({
  materialRepository,
  analysisRepository,
  client,
});

const ready = (async () => {
  await providerSettings.load();
  await materialRepository.initialize();
  await analysisRepository.initialize();
  await analysisRepository.requeueInterrupted();
  await materialRepository.reload();
  await analysisRepository.pruneMissing(
    materialRepository.getState().materials.map((item) => item.id),
  );
})();

function validMaterialId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 300;
}

async function collectReportMaterials(selectedIds, taskId) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  const selected = new Set(ids);
  const materials = materialRepository.getState().materials;
  const records = analysisRepository.getState().records;
  const direct = (await providerSettings.get()).mode === 'direct';
  const briefs = [];
  for (const material of materials.filter((material) => material.taskId === taskId && selected.has(material.id))) {
    const record = records.find((record) => (
      record.materialId === material.id
      && record.contentHash === material.contentHash
      && record.status === 'succeeded'
      && record.brief
    ));
    if (!record) continue;
    const brief = direct ? XhsDirectAiClient.prepareReportBrief(material, record.brief) : record.brief;
    if (brief !== record.brief) {
      const applied = await analysisRepository.applyResult(material.id, material.contentHash, brief, record.revision);
      if (!applied) throw new Error('素材已变化，请重新生成报告');
    }
    briefs.push(brief);
  }
  return briefs;
}

function waitForDownloadResult(downloadId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      callback(value);
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') finish(resolve, { ok: true, downloadId });
      if (delta.state?.current === 'interrupted') {
        finish(reject, new Error(`download interrupted: ${delta.error?.current || 'unknown reason'}`));
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items?.[0];
      if (!item) return;
      if (item.state === 'complete') finish(resolve, { ok: true, downloadId });
      if (item.state === 'interrupted') finish(reject, new Error(`download interrupted: ${item.error || 'unknown reason'}`));
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const operation = (async () => {
    if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') {
      return { ok: false, error: 'invalid_sender' };
    }
    if (message.type === 'XMC_DOWNLOAD_FILE') {
      if (typeof message.url !== 'string' || !message.url.startsWith('data:')) {
        return { ok: false, error: 'invalid_download_url' };
      }
      const id = await chrome.downloads.download({
        url: message.url,
        filename: typeof message.filename === 'string' ? message.filename : 'shiji-report-export',
        saveAs: false,
        conflictAction: 'uniquify',
      });
      return waitForDownloadResult(id);
    }
    if (message.type === 'XMC_GET_AUTH_STATUS') {
      return { ok: true, status: await authClient.getStatus() };
    }
    if (message.type === 'XMC_AUTH_SIGN_IN') {
      return { ok: true, status: await authClient.signIn() };
    }
    if (message.type === 'XMC_AUTH_SIGN_OUT') {
      return { ok: true, status: await authClient.signOut() };
    }
    await ready;
    await materialRepository.reload();
    if (message.type === 'XMC_GET_SETTINGS') {
      if (runtimeConfig.mode === 'cloud') return { ok: false, error: 'cloud_managed_settings' };
      return { ok: true, settings: await settingsClient.getSettings() };
    }
    if (message.type === 'XMC_GET_PROVIDER_SETTINGS') {
      return { ok: true, settings: await providerSettings.get(message.mode) };
    }
    if (message.type === 'XMC_SAVE_PROVIDER_SETTINGS') {
      return { ok: true, settings: await providerSettings.save(message.settings || {}) };
    }
    if (message.type === 'XMC_TEST_PROVIDER_SETTINGS') {
      const candidate = message.settings || {};
      const saved = await providerSettings.getSecret('direct');
      const effective = { ...saved, ...candidate, apiKey: candidate.apiKey || saved.apiKey || '' };
      if (candidate.mode === 'local') return { ok: false, error: 'local_mode_uses_existing_test' };
      await providerClient.complete({
        baseUrl: effective.baseUrl,
        model: effective.model,
        apiKey: effective.apiKey,
        messages: [{ role: 'user', content: 'Return only this JSON object: {"ok": true}' }],
      });
      await providerSettings.save(effective);
      await providerSettings.markTested('direct');
      return { ok: true, settings: { status: 'connected' } };
    }
    if (message.type === 'XMC_MARK_PROVIDER_TESTED') {
      await providerSettings.markTested(message.mode);
      return { ok: true };
    }
    if (message.type === 'XMC_CLEAR_PROVIDER_SETTINGS') {
      await providerSettings.clear(message.mode);
      return { ok: true };
    }
    if (message.type === 'XMC_TEST_SETTINGS') {
      if (runtimeConfig.mode === 'cloud') return { ok: false, error: 'cloud_managed_settings' };
      return { ok: true, settings: await settingsClient.testSettings(message.settings || {}) };
    }
    if (message.type === 'XMC_SAVE_SETTINGS') {
      if (runtimeConfig.mode === 'cloud') return { ok: false, error: 'cloud_managed_settings' };
      return { ok: true, settings: await settingsClient.saveSettings(message.settings || {}) };
    }
    if (message.type === 'XMC_ANALYZE_MATERIAL') {
      await analysisRepository.reload();
      if (!analysisRepository.getState().enabled) return { ok: false, error: 'ai_disabled' };
      if (!validMaterialId(message.materialId)) {
        return { ok: false, error: 'invalid_material_id' };
      }
      await coordinator.processMaterial(message.materialId);
    } else if (message.type === 'XMC_ENABLE_AI') {
      const activeProvider = await providerSettings.get();
      if (activeProvider.mode === 'direct' && !activeProvider.ready) {
        return { ok: false, error: '请先在模型设置中测试连接成功' };
      }
      await analysisRepository.enable();
      for (const material of materialRepository.getState().materials) {
        await analysisRepository.ensureMaterial(material);
      }
    } else if (message.type === 'XMC_DRAIN_ANALYSIS_QUEUE') {
      await analysisRepository.reload();
      if (!analysisRepository.getState().enabled) return { ok: false, error: 'ai_disabled' };
      await coordinator.drain();
    } else if (message.type === 'XMC_RETRY_ANALYSIS') {
      if (!validMaterialId(message.materialId)) return { ok: false, error: 'invalid_material_id' };
      await analysisRepository.reload();
      if (!analysisRepository.getState().enabled) return { ok: false, error: 'ai_disabled' };
      await coordinator.retryMaterial(message.materialId);
    } else if (message.type === 'XMC_RETRY_ALL_ANALYSIS') {
      const materialIds = Array.isArray(message.materialIds)
        ? [...new Set(message.materialIds.filter(validMaterialId))].slice(0, 200)
        : [];
      await analysisRepository.reload();
      if (!analysisRepository.getState().enabled) return { ok: false, error: 'ai_disabled' };
      const processed = await coordinator.retryAll(materialIds);
      return { ok: true, processed };
    } else if (message.type === 'XMC_GENERATE_REPORT') {
      await analysisRepository.reload();
      const goal = typeof message.goal === 'string' ? message.goal.trim() : '';
      const selectedIds = Array.isArray(message.selectedMaterialIds)
        ? message.selectedMaterialIds.filter(validMaterialId)
        : [];
      const taskId = validMaterialId(message.taskId) ? message.taskId : '';
      if (!taskId) return { ok: false, error: 'invalid_report_task' };
      const selectedMaterials = await collectReportMaterials(selectedIds, taskId);
      if (goal.length < 4) return { ok: false, error: 'invalid_report_goal' };
      if (selectedMaterials.length < 2) return { ok: false, error: 'insufficient_report_materials' };
      const report = await reportClient.generate({
        goal,
        constraints: Array.isArray(message.constraints) ? message.constraints : [],
        selectedMaterials,
        sourceRevision: typeof message.sourceRevision === 'string' ? message.sourceRevision : '',
        reportPreset: typeof message.reportPreset === 'string' ? message.reportPreset : null,
        familiarityLevel: typeof message.familiarityLevel === 'string' ? message.familiarityLevel : 'beginner',
        supplementMode: typeof message.supplementMode === 'string' ? message.supplementMode : 'source_only',
      });
      return { ok: true, report };
    } else if (message.type === 'XMC_PRUNE_ANALYSIS') {
      await analysisRepository.pruneMissing(
        materialRepository.getState().materials.map((item) => item.id),
      );
    } else {
      return { ok: false, ignored: true };
    }
    return { ok: true };
  })();
  operation.then(
    sendResponse,
    (error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});
