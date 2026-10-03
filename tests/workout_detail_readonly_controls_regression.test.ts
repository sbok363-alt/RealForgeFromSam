import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync(
  new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url),
  'utf8'
);

assert(
  source.includes('const canModifySet = isEditMode || isLiveSession;'),
  'detail view must derive one truthful capability flag for set-detail controls'
);

const setTypeStart = source.indexOf('{/* Set Type Pill Badge */}');
const setTypeEnd = source.indexOf('{/* Previous Set ghost stats OR PR Badge */}', setTypeStart);
assert(setTypeStart >= 0 && setTypeEnd > setTypeStart, 'set type control section must exist');
const setTypeSection = source.slice(setTypeStart, setTypeEnd);
assert(
  setTypeSection.includes('disabled={!canModifySet}'),
  'set type control must be disabled in read-only detail/history views'
);
assert(
  setTypeSection.includes("canModifySet ? `Type: ${setTypeLabel} (Tap to change)` : `Type: ${setTypeLabel}`"),
  'set type tooltip must not advertise a mutation when the control is read-only'
);

const emptyStateStart = source.indexOf('/* Clean Empty State with Add Exercise CTA */');
const emptyStateEnd = source.indexOf('/* Exercise Cards List */', emptyStateStart);
assert(emptyStateStart >= 0 && emptyStateEnd > emptyStateStart, 'empty workout detail state must exist');
const emptyStateSection = source.slice(emptyStateStart, emptyStateEnd);
assert(
  emptyStateSection.includes('{canModifySet ? (') &&
  emptyStateSection.includes('Edit this workout to add exercises.'),
  'empty read-only workouts must not expose an active Add Exercise mutation control'
);
