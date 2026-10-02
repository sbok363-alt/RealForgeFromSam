import { readFileSync } from 'node:fs';
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

console.log('B2 Firestore optional-field serialization regression passed');
