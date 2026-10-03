import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const detail = readFileSync(new URL('../src/components/WorkoutDetailModal.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const auditPage = readFileSync(new URL('../src/pages/AuditLogs.tsx', import.meta.url), 'utf8');
const auditModal = readFileSync(new URL('../src/components/MutationAuditModal.tsx', import.meta.url), 'utf8');

assert(
  detail.includes('const isLiveSession = Boolean('),
  'workout details must distinguish a real live session from an ordinary detail view'
);
assert(
  !detail.includes("isCompleting = !isEditMode") &&
  !detail.includes("'Finish Workout'"),
  'detail view must never complete a workout just because edit mode is off'
);
assert(
  detail.includes("status: workout.status"),
  'detail edits and optimization must preserve workout lifecycle status'
);
assert(
  detail.includes('disabled={!isEditMode && !isLiveSession}') &&
  detail.includes('disabled={isEditMode || !isLiveSession}'),
  'detail set controls must be read-only unless editing or logging the actual live session'
);
assert(
  detail.indexOf('if (!isOpen) return null;') > detail.indexOf('useWorkoutStore()'),
  'modal must not conditionally return before hooks are declared'
);

assert(
  api.includes('executeRollbackValidation(userId, current.id, current, log)'),
  'Guest rollback must reuse the hardened contiguous rollback validator'
);
assert(
  api.includes("action: 'CREATE'") &&
  api.includes("mutationType: 'CREATE_WORKOUT'") &&
  api.includes("inverseDelta: { deleted: true }"),
  'Guest workout creation must produce a legitimate creation audit record'
);
assert(
  api.includes("action: 'UPDATE'") &&
  api.includes('inverseDelta: workoutInverseDelta(current)'),
  'Guest mutations must preserve exact local inverse deltas'
);
const auditReadStart = api.indexOf('export async function getMutationAuditLogs');
const auditReadEnd = api.indexOf('export async function recordMutationAuditLog', auditReadStart);
const auditRead = api.slice(auditReadStart, auditReadEnd);
assert(
  auditRead.includes('if (isGuestUserId(userId))') &&
  auditRead.indexOf('if (isGuestUserId(userId))') < auditRead.indexOf("collection(db, 'mutation_audit_logs')"),
  'Guest audit reads must return from local truth before any Firestore audit query'
);
assert(
  !api.includes("|| 'demo-token'"),
  'Guest rollback and proposal paths must never revive the legacy demo token fallback'
);
assert(
  auditPage.includes("isGuest ? 'Local Audit'") &&
  auditPage.includes("'Server + Local History'") &&
  auditPage.includes("'Server Audit'"),
  'Audit page must distinguish Guest-local, mixed migrated, and server-authoritative history'
);
assert(
  auditModal.includes('if (res.deleted)'),
  'audit modal must handle creation rollback that deletes the created workout'
);
