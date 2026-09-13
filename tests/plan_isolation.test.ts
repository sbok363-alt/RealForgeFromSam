import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';

const { handleMutationsExecute, setAdminAuthForTesting } = await import(
  process.env.FORGE_BASELINE_TEST ? '../.baseline-server.test.ts' : '../server.ts'
);
setAdminAuthForTesting({ verifyIdToken: async (token: string) => {
  if (token !== 'token-A') throw new Error('Invalid token');
  return { uid: 'A' };
} });
const days = [{ id: 'day', name: 'Day', exercises: [{ id: 'item', exerciseId: 'squat', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 }] }];
async function modify(storage: InMemoryMutationStorageAdapter, id: string, baseVersion = 1, extra = {}) {
  const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } };
  await handleMutationsExecute({ headers: { authorization: 'Bearer token-A' }, storageAdapter: storage,
    body: { mutationType: 'MODIFY_TRAINING_PLAN', envelope: { idempotencyKey: randomUUID(), userId: 'A', source: 'USER_INPUT', timestamp: new Date().toISOString(), payload: { planId: id, baseVersion, name: 'Changed', days, ...extra } } } }, res);
  return res;
}
for (const id of ['victim', ' victim ', 'global', ' global ']) {
  for (const owner of ['B', undefined]) {
    const storage = new InMemoryMutationStorageAdapter();
    const original = { id: id.trim(), ...(owner ? { userId: owner } : {}), version: 1, name: 'Private', days };
    storage.seedEntity('plans', id.trim(), original);
    const res = await modify(storage, id, 1, { userId: 'A' });
    assert.equal(res.statusCode, 403, `isolate ${JSON.stringify(id)} owner=${owner}`);
    assert.deepEqual(await storage.findExistingEntity('plans', id.trim()), original);
    assert.equal(storage.getAuditLogs().length, 0);
    assert.equal(storage.getIdempotencyRecords().length, 0);
    assert.ok(!JSON.stringify(res.body).includes('Private'));
  }
}
for (const id of ['a/b', '..', '.', 'a\u0000b', 'x'.repeat(129)]) {
  const storage = new InMemoryMutationStorageAdapter();
  assert.equal((await modify(storage, id)).statusCode, 400, `invalid ID ${JSON.stringify(id)}`);
  assert.equal(storage.getAuditLogs().length, 0);
}
for (const id of ['owned', 'global']) {
  const storage = new InMemoryMutationStorageAdapter();
  storage.seedEntity('plans', id, { id, userId: 'A', version: 1, name: 'Before', days });
  assert.equal((await modify(storage, ` ${id} `)).statusCode, 200, 'canonical owned target succeeds');
  assert.equal((await storage.findExistingEntity('plans', id))?.version, 2);
  assert.equal((await modify(storage, id)).statusCode, 409, 'stale replacement conflicts');
  assert.equal(storage.getAuditLogs().length, 1);
}
const legacy = new InMemoryMutationStorageAdapter();
legacy.seedEntity('plans', 'legacy', { id: 'legacy', userId: 'A', days });
assert.equal((await modify(legacy, 'legacy', 0)).statusCode, 200);
assert.equal((await legacy.findExistingEntity('plans', 'legacy'))?.version, 1);
assert.equal((await modify(new InMemoryMutationStorageAdapter(), 'missing')).statusCode, 404);
console.log('PASS plan isolation, normalization, ownerless records and OCC');
