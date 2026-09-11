const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XhsDirectAiClient = require('../src/direct-ai-client');
const { createAnalysisRepository } = require('../src/analysis-repository');

async function setup(filename, mode = 'direct') {
  const data = {};
  const storage = { get: async (key) => ({ [key]: structuredClone(data[key]) }), set: async (values) => Object.assign(data, structuredClone(values)) };
  const analysisRepository = createAnalysisRepository(storage);
  await analysisRepository.initialize();
  const materials = ['m1', 'm2', 'other'].map((id) => ({ id, taskId: id === 'other' ? 't2' : 't1', contentHash: 'h1', bodyText: `原文${id}`, title: id }));
  for (const material of materials) {
    await analysisRepository.ensureMaterial(material);
    await analysisRepository.applyResult(material.id, material.contentHash, { materialId: material.id, contentHash: material.contentHash, summary: '旧摘要' });
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
  const functionSource = source.match(/(?:async )?function collectReportMaterials\([\s\S]*?(?=\nfunction waitForDownloadResult)/)?.[0];
  assert.ok(functionSource);
  const context = vm.createContext({
    XhsDirectAiClient, analysisRepository,
    materialRepository: { getState: () => ({ materials }) },
    providerSettings: { get: async () => ({ mode }) },
  });
  vm.runInContext(functionSource, context);
  return { collect: (...args) => context.collectReportMaterials(...args), analysisRepository, materials, source };
}

for (const filename of ['background.js', 'background-bundle.js']) {
  test(`${filename} migrates only selected current-task legacy briefs and persists evidence`, async () => {
    const { collect, analysisRepository, source } = await setup(filename);
    const result = await collect(['m1', 'm2', 'other'], 't1');
    assert.equal(result.length, 2);
    assert.ok(result.every((brief) => brief.evidence?.length));
    await analysisRepository.reload();
    assert.deepEqual(analysisRepository.getRecord('m1').brief.evidence, result[0].evidence);
    assert.equal(analysisRepository.getRecord('other').brief.evidence, undefined);
    assert.match(source, /await collectReportMaterials\(selectedIds, taskId\)/);
  });
}

test('local mode keeps the existing brief contract unchanged', async () => {
  const { collect, analysisRepository } = await setup('background.js', 'local');
  const before = analysisRepository.getRecord('m1');
  await collect(['m1'], 't1');
  assert.deepEqual(analysisRepository.getRecord('m1'), before);
});

test('stale material hashes are excluded rather than assigning evidence to old summaries', async () => {
  const { collect, materials } = await setup('background.js');
  materials[0].contentHash = 'changed';
  const result = await collect(['m1'], 't1');
  assert.equal(result.length, 0);
});

test('a concurrent analysis retry prevents the migration from overwriting its record', async () => {
  const { collect, analysisRepository } = await setup('background.js');
  const apply = analysisRepository.applyResult;
  analysisRepository.applyResult = async (...args) => {
    await analysisRepository.retry('m1');
    return apply(...args);
  };
  await assert.rejects(collect(['m1'], 't1'), /素材/);
  assert.equal(analysisRepository.getRecord('m1').status, 'pending');
});
