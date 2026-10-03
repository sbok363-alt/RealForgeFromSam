import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');

assert(
  source.includes("import { projectCompletedWorkingSets } from '../lib/workout-session';"),
  'workout list volume must reuse the canonical completed-working-set projection'
);
assert(
  source.includes('const totalVolume = projectCompletedWorkingSets(workout)') &&
  source.includes('.reduce((sum, set) => sum + (set.weight * set.reps), 0);'),
  'workout cards must derive displayed volume only from completed working sets'
);
assert(
  !source.includes('const totalVolume = displaySets.reduce((sum, set) => sum + (set.weight * set.reps), 0);'),
  'workout cards must not present prescribed or incomplete set volume as logged volume'
);
