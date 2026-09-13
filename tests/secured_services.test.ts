import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { changePlan } from '../src/server/plans';
import { createWorkoutProposal, reviewProposal } from '../src/server/proposals';
import { canonical } from '../src/server/security';

// Serial fake for service contract tests only. Concurrency is verified separately by the emulator suite.
class FakeDb {
  docs = new Map<string, any>();
  failCommit = false;
  collection(name: string) { return { doc: (id: string) => ({ key: `${name}/${id}`, id }) }; }
  async runTransaction(fn: any) {
    const staged = structuredClone(this.docs);
    let writing = false;
    const outcome = await fn({
      get: async (ref: any) => { assert.equal(writing, false, 'All reads must precede writes'); return { exists: staged.has(ref.key), data: () => structuredClone(staged.get(ref.key)) }; },
      set: (ref: any, value: any) => { writing = true; staged.set(ref.key, structuredClone(value)); },
      create: (ref: any, value: any) => { assert.ok(!staged.has(ref.key)); writing = true; staged.set(ref.key, structuredClone(value)); },
      delete: (ref: any) => { writing = true; staged.delete(ref.key); },
    });
    if (this.failCommit) throw new Error('Injected commit failure');
    this.docs = staged;
    return outcome;
  }
}
const db = new FakeDb();
const plan = { name: 'Blank draft', weeklyFrequency: 3, isActive: false, days: [] };
const input = { id: 'plan', plan, mutationId: randomUUID() };
const created = await changePlan(db, 'A', 'CREATE_PLAN', input);
assert.equal(created.plan.version, 1);
assert.deepEqual(await changePlan(db, 'A', 'CREATE_PLAN', input), created);
await assert.rejects(changePlan(db, 'B', 'CREATE_PLAN', input), /reconciliation/);
await assert.rejects(changePlan(db, 'B', 'UPDATE_PLAN', { ...input, mutationId: randomUUID(), baseVersion: 1 }), /Unauthorized/);
await assert.rejects(changePlan(db, 'A', 'UPDATE_PLAN', { ...input, mutationId: randomUUID(), baseVersion: 0 }), /changed/);
db.failCommit = true;
const snapshot = structuredClone(db.docs);
await assert.rejects(changePlan(db, 'A', 'DELETE_PLAN', { id: 'plan', mutationId: randomUUID(), baseVersion: 1 }), /Injected/);
assert.deepEqual(db.docs, snapshot); db.failCommit = false;
db.docs.set('workouts/w', { id: 'w', userId: 'A', title: 'Training', scheduledDate: '2026-09-13', status: 'PLANNED', version: 1, sets: [{ id: 's', exercise: 'Squat', weight: 80, reps: 5, completed: false }] });
const candidate = { targetEntityId: 'w', baseVersion: 1, summary: 'Increase load', afterState: { sets: [{ id: 's', exercise: 'Squat', weight: 82.5, reps: 5, completed: false }] } };
await assert.rejects(createWorkoutProposal(db, 'A', candidate), /read-only/);
db.docs.set('user_permissions/A', { userId: 'A', autonomyLevel: 'L1_MICRO_ACTIONS', permissionEpoch: 1 });
await assert.rejects(createWorkoutProposal(db, 'A', { ...candidate, afterState: { title: 'Different' } }), /guided/);
await assert.rejects(createWorkoutProposal(db, 'B', candidate), /Unauthorized/);
await assert.rejects(createWorkoutProposal(db, 'A', { ...candidate, afterState: { status: 'COMPLETED' } }), /Unsupported/);
await assert.rejects(createWorkoutProposal(db, 'A', { ...candidate, afterState: { sets: [{ id: 's', exercise: 'Squat', weight: '82.5', reps: 5 }] } }), /numeric/);
const p = await createWorkoutProposal(db, 'A', candidate);
const approval = { mutationId: randomUUID(), contentHash: p.contentHash };
await assert.rejects(reviewProposal(db, 'B', p.id, approval), /Unauthorized/);
await assert.rejects(reviewProposal(db, 'A', p.id, { ...approval, contentHash: '0'.repeat(64) }), /changed/);
const applied = await reviewProposal(db, 'A', p.id, approval);
assert.equal(applied.workout.version, 2);
assert.deepEqual(await reviewProposal(db, 'A', p.id, approval), applied);
await assert.rejects(reviewProposal(db, 'A', p.id, { ...approval, mutationId: randomUUID() }, true), /terminal/);
const stale = await createWorkoutProposal(db, 'A', { ...candidate, baseVersion: 2 });
db.docs.get('workouts/w').version = 3;
const conflict = await reviewProposal(db, 'A', stale.id, { mutationId: randomUUID(), contentHash: stale.contentHash });
assert.equal(conflict.conflict, true);
assert.equal(db.docs.get(`proposals/${stale.id}`).status, 'REJECTED_CONFLICT');
const pending = await createWorkoutProposal(db, 'A', { ...candidate, baseVersion: 3 });
db.docs.get('user_permissions/A').permissionEpoch++;
await assert.rejects(reviewProposal(db, 'A', pending.id, { mutationId: randomUUID(), contentHash: pending.contentHash }), /Permissions changed/);
assert.notEqual(canonical({ a: '1' }), canonical({ a: 1 }));
for (const bad of [NaN, Infinity, undefined, { constructor: 'bad' }]) assert.throws(() => canonical(bad));
console.log('PASS transactional plans, immutable proposal review, policy, replay and committed conflicts');
