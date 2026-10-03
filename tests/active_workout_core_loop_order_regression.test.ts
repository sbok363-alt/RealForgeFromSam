import { readFileSync } from 'node:fs';
import './active_workout_apply_target_identity_regression.test';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/workout/ActiveWorkout.tsx', import.meta.url),
  'utf8'
);

const setLoggerIndex = source.indexOf('<GymSetRow');
const guidanceIndex = source.indexOf('Session guidance');

assert(setLoggerIndex >= 0, 'active workout must render the set logger');
assert(guidanceIndex >= 0, 'active workout must retain optional session guidance');
assert(
  setLoggerIndex < guidanceIndex,
  'set logging must appear before progression and analytics guidance'
);
assert(
  source.includes('<details className="border-t border-border/40 bg-secondary/10 group">'),
  'secondary session guidance must be collapsed by default'
);
