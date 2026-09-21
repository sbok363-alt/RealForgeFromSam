import {
  evaluateIdempotencyRecord,
  hashCreateWorkoutPayload,
} from '../src/lib/idempotency-guard';
import { Workout } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const workoutA: Workout = {
  id: 'w1',
  userId: 'u1',
  title: 'Push',
  scheduledDate: '2026-09-21',
  status: 'COMPLETED',
  version: 1,
  sets: [],
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

const workoutB: Workout = {
  ...workoutA,
  createdAt: '2026-09-21T10:00:01.000Z',
  updatedAt: '2026-09-21T10:00:01.000Z',
};

const h1 = hashCreateWorkoutPayload('w1', workoutA, 'USER', 'finish fallback');
const h2 = hashCreateWorkoutPayload('w1', workoutB, 'USER', 'finish fallback');
assert(h1 === h2, 'server-managed timestamps must not alter logical create hash');

const record = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  userId: 'u1',
  targetId: 'w1',
  payloadHash: h1,
  result: workoutA,
  createdAt: workoutA.createdAt!,
};

const replay = evaluateIdempotencyRecord(record, 'w1', h2, 'u1');
assert(replay.status === 'REPLAY', 'same logical create must return REPLAY');

console.log('✔ Dogfood idempotency regression passed');
