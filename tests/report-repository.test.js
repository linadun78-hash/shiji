const test = require('node:test');
const assert = require('node:assert/strict');

const { createMemoryStorage } = require('./test-helpers');
const { createReportRepository } = require('../src/report-repository');


test('report repository saves and reloads reports per task', async () => {
  const storage = createMemoryStorage();
  const repository = createReportRepository(storage);
  await repository.initialize();
  await repository.saveReport('task-1', { reportId: 'r1', sourceRevision: 'rev-1' });

  const saved = repository.getReport('task-1');
  assert.equal(saved.taskId, 'task-1');
  assert.equal(saved.reportId, 'r1');
  assert.equal(saved.sourceRevision, 'rev-1');
  assert.equal(saved.status, 'succeeded');
  assert.equal(saved.error, null);
  assert.match(saved.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});


test('report repository marks an existing report stale when source revision changes', async () => {
  const repository = createReportRepository(createMemoryStorage());
  await repository.initialize();
  await repository.saveReport('task-1', { reportId: 'r1', sourceRevision: 'rev-1' });
  await repository.markStale('task-1', 'rev-2');

  assert.equal(repository.getReport('task-1').status, 'stale');
  assert.equal(repository.getReport('task-1').sourceRevision, 'rev-1');
});
