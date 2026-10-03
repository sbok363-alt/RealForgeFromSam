import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8');
const workout = readFileSync(new URL('../src/pages/Workout.tsx', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../src/pages/AuditLogs.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url), 'utf8');

const googleStart = profile.indexOf('const handleConnectGoogle = async () =>');
const googleEnd = profile.indexOf('const isGuest =', googleStart);
const googleHandler = profile.slice(googleStart, googleEnd);

assert(
  googleHandler.indexOf('try {') >= 0 &&
  googleHandler.indexOf('try {') < googleHandler.indexOf('await Promise.all'),
  'Google upgrade snapshot failures must be caught by the visible migration error path'
);
assert(
  profile.includes('GOOGLE_SYNC_ERROR_KEY') &&
  profile.includes('window.sessionStorage.setItem(GOOGLE_SYNC_ERROR_KEY') &&
  profile.includes('role="alert"') &&
  profile.includes('aria-live="assertive"'),
  'Google sync failures must survive remounts and render as an assertive visible alert'
);
assert(
  profile.includes('Your local Guest data is still on this device.'),
  'Google sync failure copy must truthfully preserve local Guest data'
);

assert(
  workout.includes("All Workouts ({loading ? '…' : workouts.length})") &&
  workout.includes("Planned ({loading ? '…'") &&
  workout.includes("Completed ({loading ? '…'") &&
  workout.includes('aria-busy={loading}'),
  'Workout counters must not render truthful-looking zero values before hydration completes'
);
assert(
  audit.includes("loading ? 'Loading audit'") &&
  audit.includes("All Actors ({loading ? '…' : logs.length})") &&
  audit.includes("AI Brain ({loading ? '…'") &&
  audit.includes("User Edits ({loading ? '…'"),
  'Audit scope and counters must distinguish hydration from an actually empty log'
);

for (const [name, source] of [['workout page', workout], ['workout detail', detail]] as const) {
  assert(
    source.includes('role="dialog"') &&
    source.includes('aria-modal="true"') &&
    source.includes('aria-labelledby=') &&
    source.includes('aria-describedby='),
    name + ' delete confirmation must expose dialog semantics'
  );
  assert(
    source.includes('requestAnimationFrame(() => deleteCancelRef.current?.focus())') &&
    source.includes('previousFocus?.focus()') &&
    source.includes("event.key === 'Escape'"),
    name + ' delete confirmation must move focus in, restore focus, and support Escape'
  );
}

const userFacingFiles = [
  '../src/pages/Auth.tsx',
  '../src/pages/Home.tsx',
  '../src/pages/Onboarding.tsx',
  '../src/pages/Workout.tsx',
  '../src/pages/Plans.tsx',
  '../src/pages/Progress.tsx',
  '../src/pages/Profile.tsx',
  '../src/pages/AuditLogs.tsx',
  '../src/pages/Brain.tsx',
  '../src/pages/Proposals.tsx',
  '../src/layouts/Layout.tsx',
  '../src/components/ui/ForgeLogo.tsx',
  '../src/components/ui/LiquidNav.tsx',
  '../src/components/WorkoutDetailModal.tsx',
  '../src/components/ProposalDiffCard.tsx',
  '../src/components/MutationAuditModal.tsx',
  '../src/components/PhysiqueHeatmap.tsx',
];

for (const path of userFacingFiles) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  assert(
    !/\bFORGE\b|Cyber-Forge|\bGast\b|Demo Athlete|athlete@forge\.local/.test(source),
    'user-facing branding/language leakage remains in ' + path
  );
}
