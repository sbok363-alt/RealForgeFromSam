import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const adapter = readFileSync(
  new URL('../src/server/mutations/firestore-adapter.ts', import.meta.url),
  'utf8'
);
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

const recordAuditStart = adapter.indexOf('async recordAuditLog');
const recordAuditEnd = adapter.indexOf('async commitMutation', recordAuditStart);
const recordAuditBlock = adapter.slice(recordAuditStart, recordAuditEnd);

assert(recordAuditStart >= 0, 'Firestore adapter must expose recordAuditLog');
assert(
  recordAuditBlock.includes("collection('secure_mutation_audit_logs')"),
  'generic secure-pipeline audit entries must use the isolated secure audit collection'
);
assert(
  !recordAuditBlock.includes("collection('mutation_audit_logs')"),
  'generic secure-pipeline audit entries must never enter the workout rollback collection'
);

assert(
  rules.includes('match /secure_mutation_audit_logs/{logId}') &&
  rules.includes('allow read, list: if isSignedIn() && existing().userId == request.auth.uid;'),
  'secure audit records must remain owner-readable'
);
assert(
  /match\s+\/secure_mutation_audit_logs\/\{logId\}[\s\S]*?allow write:\s*if false;/.test(rules),
  'secure audit records must remain server-authoritative'
);

const auditReadStart = api.indexOf('export async function getMutationAuditLogs');
const auditReadEnd = api.indexOf('export function migrateLocalAuditHistory', auditReadStart);
const auditReadBlock = api.slice(auditReadStart, auditReadEnd);
assert(
  auditReadBlock.includes("collection(db, 'mutation_audit_logs')") &&
  !auditReadBlock.includes("collection(db, 'secure_mutation_audit_logs')"),
  'workout rollback UI must read only rollback-compatible audit records'
);

console.log('Secure audit collection isolation regression passed');
