import {
  hashCreateWorkoutPayload,
  evaluateIdempotencyRecord,
} from '../src/lib/idempotency-guard';

const workoutA = {
  id: 'w1', userId: 'u1', title: 'Push', scheduledDate: '2026-09-21',
  status: 'COMPLETED', version: 1, sets: [],
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};
const workoutB = {
  ...workoutA,
  createdAt: '2026-09-21T10:00:01.000Z',
  updatedAt: '2026-09-21T10:00:01.000Z',
};
const h1 = hashCreateWorkoutPayload('w1', workoutA as any, 'USER', 'finish fallback');
const h2 = hashCreateWorkoutPayload('w1', workoutB as any, 'USER', 'finish fallback');
if (h1 !== h2) throw new Error('server-managed timestamps must not change create idempotency hash');

const record = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  userId: 'u1', targetId: 'w1', payloadHash: h1, result: workoutA,
  createdAt: workoutA.createdAt,
};
const replay = evaluateIdempotencyRecord(record, 'w1', h2, 'u1');
if (replay.status !== 'REPLAY') throw new Error('same logical create must replay');
