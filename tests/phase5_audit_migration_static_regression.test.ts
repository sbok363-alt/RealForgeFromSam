import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8');
const auditPage = readFileSync(new URL('../src/pages/AuditLogs.tsx', import.meta.url), 'utf8');
const auditModal = readFileSync(new URL('../src/components/MutationAuditModal.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/pages/Auth.tsx', import.meta.url), 'utf8');
const guestSession = readFileSync(new URL('../src/lib/guest-session.ts', import.meta.url), 'utf8');

assert(
  api.includes('export function migrateLocalAuditHistory') &&
  api.includes("storageScope: 'LOCAL_MIGRATED'"),
  'Guest audit history must be re-keyed locally under the cloud UID during upgrade'
);
assert(
  api.includes("storageScope: 'SERVER'"),
  'server audit reads must be explicitly distinguished from local history'
);
assert(
  api.includes("log.storageScope !== 'SERVER'") &&
  api.includes('Preserved local Guest history is read-only after cloud sync'),
  'migrated local audit entries must fail closed if rollback is attempted after cloud cutover'
);
assert(
  profile.indexOf('verifyCloudMigration(result.user.uid') <
    profile.indexOf('migrateLocalAuditHistory(guestUid, result.user.uid)'),
  'local audit history must only migrate after cloud training data verifies'
);
assert(
  auditPage.includes('Server + Local History') &&
  auditPage.includes('Preserved local history (read-only after cloud sync)'),
  'audit page must explain mixed server/local provenance truthfully'
);
assert(
  auditModal.includes("log.storageScope === 'LOCAL_MIGRATED'") &&
  auditModal.includes('Read-only local history'),
  'workout audit modal must not offer server rollback for migrated local history'
);

assert(
  guestSession.includes('export function hasLocalGuestData') &&
  auth.includes('if (hasGuestData)') &&
  auth.includes('routeThroughGuestUpgrade()'),
  'direct Google auth must route existing Guest data through the verified upgrade path'
);

assert(
  guestSession.includes('export function retireGuestTrainingDataAfterUpgrade'),
  'successful cloud upgrade must retire the stale Guest identity'
);

const verifyIndex = profile.indexOf('verifyCloudMigration(result.user.uid');
const auditCopyIndex = profile.indexOf('migrateLocalAuditHistory(guestUid, result.user.uid)');
const retireIndex = profile.indexOf('retireGuestTrainingDataAfterUpgrade(guestUid)');
assert(
  verifyIndex >= 0 &&
  verifyIndex < auditCopyIndex &&
  auditCopyIndex < retireIndex,
  'Guest source retirement must happen only after cloud verification and local audit preservation'
);
