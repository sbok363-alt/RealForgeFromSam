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
assert(
  api.includes("if (!isGuestUserId(userId)) {\n    try {\n    let q = query("),
  'Guest audit reads must bypass Firestore'
);
assert(
  !api.includes("|| 'demo-token'"),
  'Guest rollback and proposal paths must never revive the legacy demo token fallback'
);
assert(
  auditPage.includes("isGuest ? 'Local Audit' : 'Server Audit'"),
  'Audit page must label Guest history as local rather than cryptographic/server authoritative'
);
assert(
  auditModal.includes('if (res.deleted)'),
  'audit modal must handle creation rollback that deletes the created workout'
);
