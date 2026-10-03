import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const onboarding = readFileSync(new URL('../src/pages/Onboarding.tsx', import.meta.url), 'utf8');

assert(
  onboarding.includes("id: `onboarding-starter-${userId}`"),
  'onboarding starter workout must use a stable identity for safe retries'
);

const finishStart = onboarding.indexOf('const handleFinish = async () =>');
const finishEnd = onboarding.indexOf('const progress =', finishStart);
const finish = onboarding.slice(finishStart, finishEnd);

assert(
  finish.indexOf('await getWorkout(firstWorkout.id, user.uid)') <
  finish.indexOf('await saveUserProfile(profile)'),
  'starter workout existence must be checked before onboarding is declared complete'
);
assert(
  finish.indexOf('await saveWorkout(') <
  finish.indexOf('await saveUserProfile(profile)'),
  'durable starter workout creation must happen before completed profile publication'
);
assert(
  finish.indexOf('await saveUserProfile(profile)') <
  finish.indexOf("localStorage.setItem(`forge_onboarded_${user.uid}`, 'true')"),
  'local onboarding completion marker must publish only after durable writes succeed'
);

const catchStart = finish.indexOf('} catch');
const catchBlock = finish.slice(catchStart);
assert(
  !catchBlock.includes("localStorage.setItem(`forge_onboarded_") &&
  !catchBlock.includes("navigate('/', { replace: true })"),
  'failed onboarding must stay retryable instead of silently marking completion'
);
assert(
  onboarding.includes('role="alert"') &&
  onboarding.includes('Could not finish setup'),
  'onboarding save failure must be visible and retryable'
);
