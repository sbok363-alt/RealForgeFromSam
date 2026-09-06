import { 
  validateWorkoutUpdates,
  validateWorkoutSet,
  validateProposalArgs,
  isFiniteNumber,
  isValidWeight,
  isValidReps,
  isValidRir
} from '../src/lib/validation';
import { ToolLoopGuard } from '../src/lib/tool-loop-guard';
import { 
  deterministicStringify,
  hashMutationPayload, 
  evaluateIdempotencyRecord 
} from '../src/lib/idempotency-guard';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('🧪 RUNNING AUTHORITATIVE MUTATION PIPELINE TESTS 🧪');

// 1. Validation Tests
console.log('\n--- 1. Validation & Schema Guard Tests ---');

// Valid updates
const validUpdates = validateWorkoutUpdates({
  title: 'Leg Day',
  sets: [
    { id: 's1', exercise: 'Squats', weight: 100, reps: 5, completed: true, rir: 2 }
  ]
});
assert(validUpdates.title === 'Leg Day', 'Title should be preserved');
assert(validUpdates.sets?.length === 1, 'Sets should have 1 item');
console.log('✔ Valid workout payload accepted');

// Negative weight rejected
let caughtNegWeight = false;
try {
  validateWorkoutUpdates({
    sets: [
      { id: 's1', exercise: 'Squats', weight: -10, reps: 5 }
    ]
  });
} catch (e) {
  caughtNegWeight = true;
}
assert(caughtNegWeight, 'Expected negative weight to throw validation error');
console.log('✔ Negative weight rejected');

// NaN / Infinity weight rejected
let caughtNanWeight = false;
try {
  validateWorkoutUpdates({
    sets: [
      { id: 's1', exercise: 'Squats', weight: NaN, reps: 5 }
    ]
  });
} catch (e) {
  caughtNanWeight = true;
}
assert(caughtNanWeight, 'Expected NaN weight to throw validation error');
console.log('✔ NaN weight rejected');

// Invalid RIR (> 10) rejected
let caughtBadRir = false;
try {
  validateWorkoutUpdates({
    sets: [
      { id: 's1', exercise: 'Bench', weight: 80, reps: 5, rir: 15 }
    ]
  });
} catch (e) {
  caughtBadRir = true;
}
assert(caughtBadRir, 'Expected RIR > 10 to throw validation error');
console.log('✔ Invalid RIR (>10) rejected');

// Immutable fields stripped
const stripped = validateWorkoutUpdates({
  id: 'stolen_id',
  userId: 'stolen_user',
  version: 999,
  title: 'Safe Workout'
});
assert((stripped as any).id === undefined, 'Immutable id must be stripped');
assert((stripped as any).userId === undefined, 'Immutable userId must be stripped');
assert((stripped as any).version === undefined, 'Immutable version must be stripped');
console.log('✔ Immutable fields (id, userId, version) strictly stripped from updates');

// 2. Tool Loop Guard Tests
console.log('\n--- 2. Tool Loop & Infinite Recursion Guard Tests ---');

const guard = new ToolLoopGuard({ maxIterations: 5, maxIdenticalCalls: 2 });

// Call 1 & 2 identical
const step1 = guard.recordCall('updateWorkout', { workoutId: 'w1', weight: 100 });
assert(step1.allowed, 'Call 1 should be allowed');

const step2 = guard.recordCall('updateWorkout', { workoutId: 'w1', weight: 100 });
assert(step2.allowed, 'Call 2 should be allowed');

// Call 3 identical should be halted (maxIdenticalCalls: 3)
const step3 = guard.recordCall('updateWorkout', { workoutId: 'w1', weight: 100 });
assert(!step3.allowed, 'Call 3 identical should trigger halt');
assert(step3.reason === 'MAX_IDENTICAL_CALLS_EXCEEDED', 'Halt reason should be MAX_IDENTICAL_CALLS_EXCEEDED');
console.log('✔ Repetitive identical tool calls halted');

// Test oscillation detection
const oscGuard = new ToolLoopGuard({ maxIterations: 10, maxIdenticalCalls: 5 });
oscGuard.recordCall('toolA', { p: 1 });
oscGuard.recordCall('toolB', { p: 2 });
oscGuard.recordCall('toolA', { p: 1 });
const oscStep = oscGuard.recordCall('toolB', { p: 2 });
assert(!oscStep.allowed, 'Oscillating sequence A->B->A->B should be halted');
console.log('✔ Cyclic oscillation detected and halted');

// 3. Idempotency Guard Tests
console.log('\n--- 3. Deterministic Idempotency & Hashing Tests ---');

// Key-order invariance in deterministicStringify
const str1 = deterministicStringify({ b: 2, a: 1, c: [1, 2, 3] });
const str2 = deterministicStringify({ a: 1, c: [1, 2, 3], b: 2 });
assert(str1 === str2, `Serialized strings should match regardless of key order: ${str1} vs ${str2}`);

// Hash equality
const hash1 = hashMutationPayload('w1', { b: 2, a: 1 });
const hash2 = hashMutationPayload('w1', { a: 1, b: 2 });
assert(hash1 === hash2, `Hashes should match regardless of key order: ${hash1} vs ${hash2}`);
console.log('✔ Canonical payload hash is strictly key-order invariant');

// Replay detection
const testPayload = { baseVersion: 1, updates: { title: 'New' } };
const testHash = hashMutationPayload('w1', testPayload);

const eval1 = evaluateIdempotencyRecord(null, 'w1', testHash);
assert(eval1.status === 'NEW', 'First occurrence must be NEW');

const eval2 = evaluateIdempotencyRecord({
  mutationId: 'm1',
  userId: 'u1',
  targetId: 'w1',
  payloadHash: testHash,
  result: { id: 'w1', version: 2 },
  createdAt: new Date().toISOString()
}, 'w1', testHash);
assert(eval2.status === 'REPLAY', 'Exact payload replay must be REPLAY');
console.log('✔ Exact replay returns REPLAY status with cached result');

const diffHash = hashMutationPayload('w1', { baseVersion: 2, updates: { title: 'Different' } });
const eval3 = evaluateIdempotencyRecord({
  mutationId: 'm1',
  userId: 'u1',
  targetId: 'w1',
  payloadHash: testHash,
  result: { id: 'w1', version: 2 },
  createdAt: new Date().toISOString()
}, 'w1', diffHash);
assert(eval3.status === 'CONFLICT', 'Different payload with same mutationId must be CONFLICT');
console.log('✔ Mutation ID re-use with differing payload correctly identified as CONFLICT');

console.log('\n======================================================');
console.log('🎉 ALL AUTHORITATIVE PIPELINE TESTS PASSED (100% GREEN)');
console.log('======================================================');
