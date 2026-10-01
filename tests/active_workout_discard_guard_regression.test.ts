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
