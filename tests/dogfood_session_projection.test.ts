import {
  buildCompletionPayload,
  projectCompletedWorkingSets,
} from '../src/lib/workout-session';
import { Workout } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const workout: Workout = {
  id: 'w_gate1',
  userId: 'u1',
  title: 'Push',
  scheduledDate: '2026-09-21',
  status: 'IN_PROGRESS',
  version: 4,
  sets: [],
  exercises: [{
    id: 'ex_bench',
    exerciseId: 'barbell-bench-press',
    sets: [
      { id: 's_work', weight: 80, reps: 8, completed: true, setType: 'N' },
      { id: 's_warm', weight: 40, reps: 10, completed: true, setType: 'W' },
      { id: 's_typed', weight: 85, reps: 8, completed: false, setType: 'N' },
      { id: 's_bodyweight', weight: 0, reps: 12, completed: true, setType: 'N' },
    ],
  }],
};

const canonical = projectCompletedWorkingSets(workout);
assert(canonical.map(s => s.id).join(',') === 's_work,s_bodyweight',
  'only explicitly completed non-warmup sets should survive');
assert(canonical[1].weight === 0,
  'bodyweight set must not be dropped just because weight is zero');

const completion = buildCompletionPayload(workout, 1_800_000_000_000, 2710);
assert(completion.updates.status === 'COMPLETED', 'finish status must be completed');
assert(completion.updates.exercises?.[0].id === 'ex_bench', 'exercise identity must be preserved');
assert(completion.updates.sets?.[0].id === 's_work', 'set identity must be preserved');
assert(completion.totalVolume === 640, 'volume should be 80*8 + 0*12');

console.log('✔ Dogfood session projection regression passed');
