import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const workout = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');
const plans = readFileSync(new URL('../src/pages/Plans.tsx', import.meta.url), 'utf8');
const proposals = readFileSync(new URL('../src/pages/Proposals.tsx', import.meta.url), 'utf8');
const proposalCard = readFileSync(new URL('../src/components/ProposalDiffCard.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url), 'utf8');

const createBlockStart = workout.indexOf('const handleCreateEmptyWorkout');
const createBlockEnd = workout.indexOf('const handleOpenBrainForWorkout', createBlockStart);
const createBlock = workout.slice(createBlockStart, createBlockEnd);

assert(
  createBlock.includes('setSelectedWorkout(saved)') && !createBlock.includes('startWorkout(saved)'),
  'creating a planned workout must open it for editing without starting a live session'
);
assert(
  workout.includes('Details / Edit') && !workout.includes('> Optimize<'),
  'workout cards must label the detail action truthfully'
);
assert(
  !workout.includes('openWorkoutModal') && !workout.includes('const [creating,'),
  'dead workout UI state must stay removed'
);

assert(
  plans.includes('name: displayName') &&
  plans.includes('exercise: exercise.name'),
  'plan-started workouts must preserve human exercise names in nested and flat forms'
);
assert(
  plans.includes("setType: 'N' as const"),
  'plan-started workout sets must use canonical set types'
);

assert(
  proposals.includes('const isGuest = Boolean(user && isGuestUserId(user.uid))'),
  'Proposals must understand Guest capability state'
);
assert(
  proposals.includes("onRebase={isGuest ? undefined : handleRebase}") &&
  proposals.includes('Connect Google to apply or refresh AI recommendations'),
  'Guest proposal apply/rebase actions must fail closed with a clear cloud requirement'
);
assert(
  proposalCard.includes('approvalDisabledReason') &&
  proposalCard.includes("approvalDisabledReason ? 'Google required' : 'Accept recommendation'"),
  'proposal cards must disable cloud-only approval rather than throwing after the click'
);

assert(
  !detail.includes('WorkoutCelebration') &&
  !detail.includes('handleSimulateExternalEdit') &&
  !detail.includes('simulatingConflict'),
  'detail view must not retain unreachable completion or conflict-simulator code'
);
