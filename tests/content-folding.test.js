const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collapseAllMaterials,
  createSourceRevision,
  expandAllMaterials,
  getReportCandidateIds,
  isMaterialExpanded,
  resolveReportCitation,
  restoreReportSelection,
  toggleMaterialExpanded,
} = require('../src/ui-model');

test('material cards are collapsed until explicitly expanded', () => {
  const expanded = new Set();
  assert.equal(isMaterialExpanded(expanded, 'material-1'), false);
  assert.equal(isMaterialExpanded(toggleMaterialExpanded(expanded, 'material-1'), 'material-1'), true);
});

test('report selection restores the saved subset instead of selecting every candidate', () => {
  const candidates = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  const restored = restoreReportSelection(candidates, new Set(), { selectedMaterialIds: ['m1', 'm3'] });
  assert.deepEqual([...restored], ['m1', 'm3']);
});

test('report citation resolves to a readable material title and evidence quotes', () => {
  const citation = { materialId: 'm1', evidenceIds: ['E2', 'E1'] };
  const materials = [{ id: 'm1', title: '广州两日路线' }];
  const records = [{
    materialId: 'm1',
    status: 'succeeded',
    brief: { evidence: [{ id: 'E1', quote: '早上十点前人少' }, { id: 'E2', quote: '地铁口步行五分钟' }] },
  }];

  assert.deepEqual(resolveReportCitation(citation, materials, records), {
    materialTitle: '广州两日路线',
    quotes: ['地铁口步行五分钟', '早上十点前人少'],
  });
});

test('report candidates only include current succeeded analysis records', () => {
  const materials = [
    { id: 'm1', contentHash: 'v1-11111111' },
    { id: 'm2', contentHash: 'v1-22222222' },
  ];
  const records = [
    { materialId: 'm1', contentHash: 'v1-11111111', status: 'succeeded', brief: {} },
    { materialId: 'm2', contentHash: 'v1-old00000', status: 'succeeded', brief: {} },
  ];
  assert.deepEqual(getReportCandidateIds(materials, records), ['m1']);
});

test('source revision is stable regardless of material order', () => {
  const first = [{ id: 'm2', contentHash: 'b' }, { id: 'm1', contentHash: 'a' }];
  const second = first.slice().reverse();
  assert.equal(createSourceRevision(first), createSourceRevision(second));
  assert.match(createSourceRevision(first), /^rev-ui-[0-9a-f]{8}$/);
});

test('global expansion only includes visible material ids', () => {
  const expanded = expandAllMaterials(['material-1', 'material-2']);
  assert.deepEqual([...expanded], ['material-1', 'material-2']);
  assert.equal(collapseAllMaterials(expanded).size, 0);
});
