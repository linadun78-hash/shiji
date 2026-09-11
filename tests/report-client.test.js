const test = require('node:test');
const assert = require('node:assert/strict');

const { createReportClient, toReportPayload } = require('../src/report-client');


test('report payload includes validated prompt settings and excludes unrelated values', () => {
  const brief = { materialId: 'm1', evidence: [{ id: 'E1', quote: 'q' }] };
  assert.deepEqual(toReportPayload({
    goal: 'Make a plan',
    constraints: ['two days'],
    selectedMaterials: [brief],
    sourceRevision: 'rev-1',
    reportPreset: 'tutorial',
    familiarityLevel: 'informed',
    supplementMode: 'labeled_supplement',
    openUrl: 'secret',
  }), {
    goal: 'Make a plan',
    constraints: ['two days'],
    selectedMaterials: [brief],
    sourceRevision: 'rev-1',
    reportPreset: 'tutorial',
    familiarityLevel: 'informed',
    supplementMode: 'labeled_supplement',
  });
});


test('report payload defaults invalid prompt settings to safe values', () => {
  const payload = toReportPayload({
    goal: 'Make a plan',
    reportPreset: 'untrusted',
    familiarityLevel: 'expert',
    supplementMode: 'freeform',
  });

  assert.equal(payload.reportPreset, null);
  assert.equal(payload.familiarityLevel, 'beginner');
  assert.equal(payload.supplementMode, 'source_only');
});


test('report client rejects malformed success payload', async () => {
  const client = createReportClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchFn: async () => ({ ok: true, json: async () => ({ reportId: 'r1' }) }),
  });

  await assert.rejects(client.generate({
    goal: 'Make a plan', constraints: [], selectedMaterials: [], sourceRevision: 'rev-1',
  }), (error) => error.code === 'invalid_backend_response');
});
