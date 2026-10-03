import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/workout/ActiveWorkout.tsx', import.meta.url),
  'utf8'
);

assert(
  source.includes('const removeCancelRef = React.useRef<HTMLButtonElement>(null);') &&
  source.includes('const discardCancelRef = React.useRef<HTMLButtonElement>(null);'),
  'active workout confirmation dialogs must own deterministic initial-focus targets'
);
assert(
  source.includes('aria-describedby="remove-exercise-description"') &&
  source.includes('id="remove-exercise-description"') &&
  source.includes('aria-describedby="discard-workout-description"') &&
  source.includes('id="discard-workout-description"'),
  'active workout confirmation dialogs must expose their destructive consequences to assistive technology'
);
assert(
  source.includes('ref={removeCancelRef}') && source.includes('ref={discardCancelRef}'),
  'active workout confirmation dialogs must focus the safe cancel action'
);
const escapeHandlers = source.match(/event\.key === 'Escape'/g) || [];
assert(
  escapeHandlers.length >= 2,
  'both active workout confirmation dialogs must support Escape dismissal'
);
const focusRestores = source.match(/previousFocus\?\.focus\(\);/g) || [];
assert(
  focusRestores.length >= 2,
  'both active workout confirmation dialogs must restore focus to the invoking control'
);
