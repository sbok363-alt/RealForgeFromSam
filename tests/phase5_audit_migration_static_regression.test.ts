import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8');
const auditPage = readFileSync(new URL('../src/pages/AuditLogs.tsx', import.meta.url), 'utf8');
const auditModal = readFileSync(new URL('../src/components/MutationAuditModal.tsx', import.meta.url), 'utf8');

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
