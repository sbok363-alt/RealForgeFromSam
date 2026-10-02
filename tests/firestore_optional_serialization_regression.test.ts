import { readFileSync } from 'node:fs';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';
import { toFirestoreSafe } from '../src/lib/firestore-sanitize';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const input = {
  dropTopLevel: undefined,
  keepNull: null,
  keepFalse: false,
  keepZero: 0,
  keepEmpty: '',
  nested: {
    keep: 'value',
    dropNested: undefined,
  },
  list: [
    { keep: 1, dropInObject: undefined },
    undefined,
    null,
  ],
};

const safe = toFirestoreSafe(input) as any;

assert(!('dropTopLevel' in safe), 'top-level undefined field must be omitted');
assert(!('dropNested' in safe.nested), 'nested undefined field must be omitted');
assert(!('dropInObject' in safe.list[0]), 'undefined field inside array object must be omitted');
assert(safe.list[1] === null, 'undefined array slot must become null to preserve position');
assert(safe.keepNull === null, 'null must be preserved');
assert(safe.keepFalse === false, 'false must be preserved');
assert(safe.keepZero === 0, 'zero must be preserved');
assert(safe.keepEmpty === '', 'empty string must be preserved');

const adapterSource = readFileSync(
  new URL('../src/server/mutations/firestore-adapter.ts', import.meta.url),
  'utf8'
);
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

assert(
  (adapterSource.match(/toFirestoreSafe\(/g) || []).length >= 3,
  'Firestore adapter must sanitize entity, audit, and idempotency writes'
);
assert(
  serverSource.includes("await ctx.storage.commitMutation('workouts', sessionId, newWorkout);"),
  'workout creation must go through the transactional storage adapter'
);
assert(
  serverSource.includes("await ctx.storage.commitMutation('targets_1rm', targetId, targetData);"),
  'target progression writes must go through the transactional storage adapter'
);
assert(
  !serverSource.includes('adminDb.collection("workouts").doc(sessionId).set(newWorkout)'),
  'workout creation must not bypass the storage adapter'
);
assert(
  !serverSource.includes('adminDb.collection("targets_1rm").doc(targetId).set(targetData'),
  'target progression must not bypass the storage adapter'
);

const inMemoryStorage = new InMemoryMutationStorageAdapter();
inMemoryStorage.seedEntity('plans', 'plan_merge_parity', {
  id: 'plan_merge_parity',
  userId: 'user_owner',
  name: 'Before',
  weeklyFrequency: 4,
  isActive: false,
  days: [
    {
      id: 'day_1',
      name: 'Upper',
      exercises: [
        {
          id: 'pe_1',
          exerciseId: 'bench_press',
          targetSets: 3,
          targetRepsMin: 6,
          targetRepsMax: 8,
        },
      ],
    },
  ],
});

await inMemoryStorage.commitMutation('plans', 'plan_merge_parity', {
  name: 'After',
  updatedAt: '2026-10-03T00:00:00.000Z',
  omittedUndefined: undefined,
});

const merged = await inMemoryStorage.findExistingEntity('plans', 'plan_merge_parity');
assert(merged?.name === 'After', 'in-memory partial commit must update supplied fields');
assert(merged?.userId === 'user_owner', 'in-memory partial commit must preserve untouched ownership');
assert(merged?.weeklyFrequency === 4, 'in-memory partial commit must preserve untouched numeric fields');
assert(merged?.isActive === false, 'in-memory partial commit must preserve untouched false values');
assert(merged?.days?.[0]?.name === 'Upper', 'in-memory partial commit must preserve untouched nested fields');
assert(!('omittedUndefined' in (merged || {})), 'in-memory commit must omit undefined fields like Firestore');

console.log('B2 Firestore optional-field serialization and adapter merge parity regression passed');
