import { prepareWorkoutStart } from '../src/lib/workout-start';
import { Workout } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const base: Workout = {
  id: 'w1',
  userId: 'u1',
  title: 'Push',
  scheduledDate: '2026-10-01',
  status: 'PLANNED',
  version: 1,
  sets: [],
  exercises: [],
};

const prepared = prepareWorkoutStart(null, base, () => 1234567890);
assert(Boolean(prepared), 'a workout should start when no active session exists');
assert(prepared?.workout.status === 'IN_PROGRESS', 'started workout must become IN_PROGRESS');
assert(prepared?.startedAt === 1234567890, 'startedAt must use the supplied clock');
assert(prepared?.workout.startedAt === 1234567890, 'workout snapshot must carry startedAt');

const withExistingStart: Workout = {
  ...base,
  id: 'w2',
  startedAt: 42,
};
const resumed = prepareWorkoutStart(null, withExistingStart, () => 999);
assert(resumed?.startedAt === 42, 'existing startedAt must be preserved');

const active: Workout = {
  ...base,
  id: 'active',
  status: 'IN_PROGRESS',
  startedAt: 7,
};
const blocked = prepareWorkoutStart(active, { ...base, id: 'candidate' }, () => 99);
assert(blocked === null, 'starting a workout must not silently replace active work');
