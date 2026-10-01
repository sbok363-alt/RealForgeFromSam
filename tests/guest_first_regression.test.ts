import { readFileSync } from 'node:fs';
import { isGuestUserId } from '../src/lib/guest-session';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const authStore = readFileSync(new URL('../src/store/useAuthStore.ts', import.meta.url), 'utf8');
const authPage = readFileSync(new URL('../src/pages/Auth.tsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../src/pages/Onboarding.tsx', import.meta.url), 'utf8');
const workoutPage = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

assert(isGuestUserId('guest-local-test'), 'guest UID prefix must be recognized');
assert(!isGuestUserId('demo-athlete-forge'), 'legacy demo UID must not be treated as a guest');

assert(!authStore.includes('Alex Rivers'), 'guest identity must not ship with a fake named athlete');
assert(authStore.includes('createGuestUser'), 'auth store must construct a real local guest');
assert(authPage.includes('Continue as Guest'), 'auth screen must expose a guest entry path');
assert(authPage.includes('No account needed'), 'guest storage scope must be explained');

assert(!onboarding.includes('seedForgeData('), 'onboarding must not seed demo history');
assert(
  onboarding.includes('exercises: groupedExercises'),
  'starter workout must include canonical exercise groups for the active logger'
);

assert(!workoutPage.includes('seedForgeData('), 'workout page must not silently seed demo workouts');
assert(!workoutPage.includes('Reset Demo Data'), 'normal workout UI must not expose demo reset controls');

assert(
  api.includes('if (!isGuestUserId(userId))'),
  'guest workout reads must bypass Firestore'
);
assert(
  api.includes("if (isGuestSessionActive() && !auth.currentUser)"),
  'guest workout mutations must resolve locally'
);
assert(
  !api.includes("{ id: 'bw1'"),
  'bodyweight APIs must not fabricate guest history'
);
