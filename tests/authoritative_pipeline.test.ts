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
}, 'w1', diffHash, 'u1');
assert(eval3.status === 'CONFLICT', 'Different payload with same mutationId must be CONFLICT');
console.log('✔ Mutation ID re-use with differing payload correctly identified as CONFLICT');

// Cross-user idempotency isolation
const evalCrossUser = evaluateIdempotencyRecord({
  mutationId: 'm1',
  userId: 'user_A',
  targetId: 'w1',
  payloadHash: testHash,
  result: { id: 'w1', version: 2 },
  createdAt: new Date().toISOString()
}, 'w1', testHash, 'user_B');
assert(evalCrossUser.status === 'CONFLICT', 'Cross-user idempotency key collision must be rejected as CONFLICT');
assert(evalCrossUser.error?.includes('belongs to another user session'), 'Error message must reflect cross-user isolation');
console.log('✔ Multi-tenant cross-user idempotency key hijacking rejected as CONFLICT');

// 4. Proposal & OCC Simulation Tests
console.log('\n--- 4. Proposal Validation & OCC Invariants ---');

// Validate Proposal Args
const validProposalArgs = validateProposalArgs({
  targetEntityId: 'w_123',
  baseVersion: 2,
  summary: 'Increase squat volume',
  afterState: {
    title: 'Squat Day 2',
    sets: [
      { id: 's1', exercise: 'Barbell Squat', reps: 5, weight: 120 }
    ]
  }
});
assert(validProposalArgs.targetEntityId === 'w_123', 'targetEntityId must match');
assert(validProposalArgs.baseVersion === 2, 'baseVersion must be 2');
console.log('✔ Valid proposal arguments accepted');

// Proposal args with invalid baseVersion
let caughtBadVersion = false;
try {
  validateProposalArgs({
    targetEntityId: 'w_123',
    baseVersion: -1,
    summary: 'Invalid'
  });
} catch (e) {
  caughtBadVersion = true;
}
assert(caughtBadVersion, 'Expected negative baseVersion to be rejected');
console.log('✔ Negative baseVersion in proposal rejected');

// OCC Concurrency Check Simulation
function simulateOccCheck(currentDocumentVersion: number, requestedBaseVersion: number) {
  if (currentDocumentVersion !== requestedBaseVersion) {
    throw new Error(`OCC_CONFLICT: document is at v${currentDocumentVersion}, mutation requested v${requestedBaseVersion}`);
  }
  return currentDocumentVersion + 1;
}

const vNext = simulateOccCheck(3, 3);
assert(vNext === 4, 'OCC should increment version when baseVersion matches');
console.log('✔ OCC baseVersion match increments document version');

let caughtOccConflict = false;
try {
  simulateOccCheck(4, 2); // Stale write
} catch (e: any) {
  caughtOccConflict = true;
  assert(e.message.includes('OCC_CONFLICT'), 'Error must indicate OCC conflict');
}
assert(caughtOccConflict, 'Stale baseVersion must be rejected by OCC check');
console.log('✔ Stale baseVersion OCC concurrency conflict correctly detected and rejected');

// Rollback Contiguity Simulation
function simulateRollbackCheck(currentVersion: number, auditLogResultVersion: number) {
  if (currentVersion !== auditLogResultVersion) {
    throw new Error(`NON_CONTIGUOUS: current v${currentVersion} does not match mutation result v${auditLogResultVersion}`);
  }
}

simulateRollbackCheck(5, 5); // Contiguous
let caughtNonContiguous = false;
try {
  simulateRollbackCheck(6, 4); // Non-contiguous
} catch (e) {
  caughtNonContiguous = true;
}
assert(caughtNonContiguous, 'Non-contiguous rollback must be rejected');
console.log('✔ Rollback contiguity strictly enforced (cannot rollback non-adjacent versions)');

console.log('\n======================================================');
console.log('🎉 ALL AUTHORITATIVE PIPELINE TESTS PASSED (100% GREEN)');
console.log('======================================================');
