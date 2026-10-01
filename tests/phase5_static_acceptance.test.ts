import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const authProvider = readFileSync(new URL('../src/components/AuthProvider.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8');
const brain = readFileSync(new URL('../src/pages/Brain.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/lib/workout-session.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

assert(
  api.includes("localStorage.getItem(\`forge_prs_\${userId}\`)"),
  'guest personal records must have a local persistence path'
);
assert(
  !api.includes("Road to 100kg") &&
  !api.includes("3 plates milestone") &&
  !api.includes("Bodyweight overhead press goal"),
  'target APIs must not fabricate strength goals'
);
assert(
  api.includes('upsertWorkoutForCloudMigration') &&
  api.includes('verifyCloudMigration'),
  'guest cloud migration must be retry-safe and verified against cloud truth'
);

assert(
  authProvider.includes('isGuestCloudMigrationInProgress'),
  'Firebase auth observer must not cut over the UI during guest migration'
);
assert(
  profile.includes('beginGuestCloudMigration()') &&
  profile.includes('verifyCloudMigration(result.user.uid'),
  'profile migration must lock auth cutover until direct cloud verification succeeds'
);

assert(
  brain.includes('const isGuest = Boolean(user && isGuestUserId(user.uid))') &&
  brain.includes('if (isGuest) return;'),
  'guest Brain must fail closed before requesting a Firebase ID token'
);
assert(
  brain.includes('Connect Google to use Hardstate Brain'),
  'guest Brain must explain its cloud requirement instead of crashing'
);

const lightStart = css.indexOf('.light {');
const lightEnd = css.indexOf('}', lightStart);
const lightBlock = css.slice(lightStart, lightEnd);
assert(lightStart >= 0, 'light theme token block must exist');
assert(!lightBlock.includes('--background: #050505'), 'light theme must not reuse the dark background');
assert(!home.includes('bg-[#101012]'), 'Home must not force dark card backgrounds');
assert(!home.includes('text-white'), 'Home must use semantic foreground tokens');

assert(
  session.includes('exercise: exercise.name || exercise.exerciseId'),
  'completed history must preserve a human exercise label when available'
);

assert(
  rules.includes('match /target_1rms/{targetId}'),
  'target 1RM cloud sync must have an owner-only Firestore rule'
);
