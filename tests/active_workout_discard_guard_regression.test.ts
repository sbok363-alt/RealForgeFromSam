import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/workout/ActiveWorkout.tsx', import.meta.url),
  'utf8'
);

assert(
  !source.includes('onClick={() => discardWorkout()}'),
  'active workout must never expose one-tap discard'
);
assert(
  source.includes('showDiscardConfirm'),
  'discard must pass through an explicit confirmation state'
);
assert(
  source.includes('Keep workout'),
  'discard confirmation must provide a safe keep-workout action'
);
assert(
  source.includes('Discard workout'),
  'discard confirmation must name the destructive action explicitly'
);

assert(
  !source.includes('onClick={() => !isFinishing && removeExercise(ex.id)}'),
  'exercise removal must not be a one-tap destructive action'
);
assert(
  source.includes('exercisePendingRemoval'),
  'exercise removal must pass through explicit confirmation state'
);
assert(
  source.includes('Keep exercise'),
  'exercise removal confirmation must provide a safe keep-exercise action'
);
assert(
  source.includes('Remove exercise'),
  'exercise removal confirmation must name the destructive action explicitly'
);
