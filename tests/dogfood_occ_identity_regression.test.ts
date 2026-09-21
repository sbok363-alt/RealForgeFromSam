import * as fs from 'fs';
import * as path from 'path';
import { rebuildExercisesPreservingIdentity } from '../src/lib/workout-session';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const rebuilt = rebuildExercisesPreservingIdentity(
  [
    { id: 's1', exercise: 'Barbell Bench Press', weight: 80, reps: 8, completed: true },
    { id: 's2', exercise: 'Barbell Bench Press', weight: 82.5, reps: 8, completed: true },
  ],
  [{
    id: 'existing-exercise-id',
    exerciseId: 'bench_press',
    name: 'Barbell Bench Press',
    sets: [],
  }]
);

assert(rebuilt[0].id === 'existing-exercise-id',
  'manual save must preserve an existing exercise instance id');
assert(rebuilt[0].exerciseId === 'bench_press',
  'manual save must preserve canonical exercise identity');
assert(rebuilt[0].sets.map(set => set.id).join(',') === 's1,s2',
  'manual save must preserve set ids');

const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/WorkoutDetailModal.tsx'),
  'utf8'
);
assert(!modalSource.includes('Force override?'),
  'manual OCC conflict must not offer unsafe force overwrite');
assert(!modalSource.includes('mutateWorkout(workout.id, e.currentVersion'),
  'manual OCC conflict must not rebase stale local updates onto server version');

console.log('✔ Dogfood OCC and identity regression passed');
