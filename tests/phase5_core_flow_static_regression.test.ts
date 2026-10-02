import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const detail = readFileSync(new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url), 'utf8');
const plans = readFileSync(new URL('../src/pages/Plans.tsx', import.meta.url), 'utf8');
const workout = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');
const conflict = readFileSync(new URL('../src/components/workout/WorkoutConflictModal.tsx', import.meta.url), 'utf8');
const progress = readFileSync(new URL('../src/pages/Progress.tsx', import.meta.url), 'utf8');
const charts = readFileSync(new URL('../src/components/D3PerformanceCharts.tsx', import.meta.url), 'utf8');
const heatmap = readFileSync(new URL('../src/components/PhysiqueHeatmap.tsx', import.meta.url), 'utf8');
const workoutStore = readFileSync(new URL('../src/store/useWorkoutStore.ts', import.meta.url), 'utf8');

assert(
  !detail.includes("workout.status === 'IN_PROGRESS' || !isEditMode"),
  'opening a workout detail view must never implicitly start a workout'
);
assert(
  !detail.includes('startWorkout: startActiveWorkout'),
  'detail view must not retain an implicit workout-start action'
);

assert(
  !plans.includes('finishWorkout();') && !workout.includes('finishWorkout();'),
  'replacing an active workout must never fake-finish by clearing local state'
);
assert(
  plans.includes('discardWorkout();') && workout.includes('discardWorkout();'),
  'destructive workout replacement must explicitly discard the active session'
);
assert(
  conflict.includes('Discard Current & Start New') &&
  conflict.includes('permanently discard your current active session'),
  'replacement modal must truthfully describe destructive behavior'
);

assert(
  progress.includes("workout.status === 'COMPLETED' || workout.status === 'completed'"),
  'Progress must count completed workouts across canonical status casing'
);
assert(
  charts.includes("w.status === 'COMPLETED' || w.status === 'completed'"),
  'charts must use finalized workout status instead of partially completed sets'
);

assert(
  !heatmap.includes('Demo Mode') &&
  !heatmap.includes('generateDemoHypertrophyWorkouts'),
  'real Progress UI must not switch to fabricated demo training data'
);

assert(
  workoutStore.includes('preserveExistingExerciseIdentity') &&
  workoutStore.includes('exercises: preserveExistingExerciseIdentity('),
  'active workout updates must preserve existing exercise identity when callers rebuild exercise groups'
);
