/**
 * Phase 0.75 - Part 1C: Workout Creation Rollback Regression Suite
 * 
 * Verifies that:
 * TEST 1: Legitimate creation audit entry triggers atomic deletion of workout document.
 * TEST 2: Forged audit entry with { deleted: true } cannot delete an arbitrary workout.
 * TEST 3: Creation audit entry targeting another user's workout is rejected (cross-tenant).
 * TEST 4: Creation audit entry with incorrect targetEntityId is rejected.
 * TEST 5: Creation audit entry with incorrect resultVersion is rejected (contiguity check).
 * TEST 6: Normal update rollback still restores a valid previous workout state.
 * TEST 7: Ambiguous inverseDelta combining deleted=true with state fields is strictly rejected.
 */

import { executeRollbackValidation } from '../src/lib/validation';
import { handleWorkoutRollback, setAdminAuthForTesting, setAdminDbForTesting } from '../server';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

async function runCreationRollbackTests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING PHASE 0.75 CREATION ROLLBACK REGRESSION SUITE 🛡️');
  console.log('================================================================\n');

  const authUid = 'user_authoritative_101';
  const otherUid = 'user_attacker_666';
  const targetWorkoutId = 'workout_legit_001';

  const liveCreatedWorkout = {
    id: targetWorkoutId,
    userId: authUid,
    title: 'Morning Push Routine',
    scheduledDate: '2026-09-10',
    status: 'PLANNED',
    sets: [
      { id: 's1', exercise: 'Bench Press', weight: 80, reps: 10, rir: 2, completed: true }
    ],
    version: 1,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z'
  };

  const legitimateCreationAuditLog = {
    id: 'audit_create_001',
    mutationId: 'mut_create_001',
    userId: authUid,
    actor: 'USER',
    action: 'CREATE',
    mutationType: 'CREATE_WORKOUT',
    targetEntityType: 'WORKOUT',
    targetEntityId: targetWorkoutId,
    baseVersion: 0,
    resultVersion: 1,
    summary: 'Created workout routine: Morning Push Routine',
    inverseDelta: { deleted: true },
    createdAt: '2026-09-10T10:00:00.000Z'
  };

  // -------------------------------------------------------------
  // TEST 1: A legitimate creation audit entry can rollback the workout creation
  // -------------------------------------------------------------
  console.log('--- TEST 1: Legitimate creation audit entry rolls back workout creation ---');
  const decision1 = executeRollbackValidation(authUid, targetWorkoutId, liveCreatedWorkout, legitimateCreationAuditLog);
  if (decision1.action !== 'DELETE') {
    throw new Error('Expected decision action to be DELETE');
  }
  assert(decision1.targetEntityId === targetWorkoutId, `Expected targetEntityId ${targetWorkoutId}`);

  // End-to-end endpoint verification with transactional database mock
  let transactionDeletedRef: string | null = null;
  let transactionWrittenAudits: any[] = [];
  let transactionWrittenIdemp: any[] = [];

  const mockDb = {
    collection: (colName: string) => ({
      doc: (docId?: string) => {
        const id = docId || `generated_${Math.random().toString(36).slice(2, 7)}`;
        return {
          id,
          colName,
          path: `${colName}/${id}`
        };
      }
    }),
    runTransaction: async (cb: (tx: any) => Promise<any>) => {
      const mockTx = {
        get: async (ref: any) => {
          if (ref.colName === 'workouts') {
            return { exists: true, data: () => ({ ...liveCreatedWorkout }) };
          }
          if (ref.colName === 'mutation_audit_logs') {
            return { exists: true, data: () => ({ ...legitimateCreationAuditLog }) };
          }
          if (ref.colName === 'mutation_ids') {
            return { exists: false, data: () => null };
          }
          return { exists: false };
        },
        delete: (ref: any) => {
          transactionDeletedRef = ref.path;
        },
        set: (ref: any, data: any) => {
          if (ref.colName === 'mutation_audit_logs') transactionWrittenAudits.push(data);
          if (ref.colName === 'mutation_ids') transactionWrittenIdemp.push(data);
        }
      };
      return await cb(mockTx);
    }
  };

  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'valid_token') return { uid: authUid };
      throw new Error("Invalid token");
    }
  });
  setAdminDbForTesting(mockDb);

  let responseData: any = null;
  let responseStatus = 200;
  const mockReq: any = {
    headers: { authorization: 'Bearer valid_token' },
    params: { id: targetWorkoutId },
    body: { auditLogId: 'audit_create_001', mutationId: 'idemp_rollback_001' }
  };
  const mockRes: any = {
    status: (s: number) => {
      responseStatus = s;
      return mockRes;
    },
    json: (data: any) => {
      responseData = data;
      return mockRes;
    }
  };

  await handleWorkoutRollback(mockReq, mockRes);

  assert(responseStatus === 200, `Expected status 200, got ${responseStatus}`);
  assert(responseData?.deleted === true, 'Response must indicate workout was deleted');
  assert(transactionDeletedRef === `workouts/${targetWorkoutId}`, 'Workout document must be deleted inside transaction');
  assert(transactionWrittenAudits.length === 1, 'Rollback audit entry must be recorded');
  assert(transactionWrittenAudits[0].action === 'ROLLBACK_CREATION', 'Audit action must be ROLLBACK_CREATION');
  assert(transactionWrittenAudits[0].resultVersion === 0, 'Audit resultVersion must be 0');
  assert(transactionWrittenIdemp.length === 1, 'Idempotency record must be stored');
  console.log('✔ Verified legitimate creation audit entry deletes workout document atomically.\n');

  // -------------------------------------------------------------
  // TEST 2: Forged audit entry with only { deleted: true } is rejected
  // -------------------------------------------------------------
  console.log('--- TEST 2: Forged audit entry containing only { deleted: true } is blocked ---');
  const forgedDeletionAuditLog = {
    id: 'audit_forged_delete_001',
    mutationId: 'mut_forged_001',
    userId: authUid,
    actor: 'USER',
    action: 'UPDATE', // Claims to be an update or omitted action, not an authoritative CREATE
    mutationType: 'UPDATE_WORKOUT',
    targetEntityType: 'WORKOUT',
    targetEntityId: targetWorkoutId,
    baseVersion: 1,
    resultVersion: 2,
    summary: 'Forged update with deleted: true',
    inverseDelta: { deleted: true },
    createdAt: '2026-09-10T11:00:00.000Z'
  };

  let forgedBlocked = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, { ...liveCreatedWorkout, version: 2 }, forgedDeletionAuditLog);
  } catch (err: any) {
    if (err.message.includes('FORGED_DELETION_AUDIT_LOG')) {
      forgedBlocked = true;
    }
  }
  assert(forgedBlocked, 'Forged audit entry with deleted: true must be blocked with FORGED_DELETION_AUDIT_LOG');

  // Verify HTTP endpoint status 403 on forged audit
  mockDb.runTransaction = async (cb: any) => {
    return await cb({
      get: async (ref: any) => {
        if (ref.colName === 'workouts') return { exists: true, data: () => ({ ...liveCreatedWorkout, version: 2 }) };
        if (ref.colName === 'mutation_audit_logs') return { exists: true, data: () => ({ ...forgedDeletionAuditLog }) };
        return { exists: false };
      },
      delete: () => { throw new Error('SHOULD_NOT_DELETE'); },
      set: () => {}
    });
  };

  responseStatus = 200;
  responseData = null;
  mockReq.body = { auditLogId: 'audit_forged_delete_001' };
  await handleWorkoutRollback(mockReq, mockRes);
  assert(responseStatus === 403, `Expected HTTP 403 for forged deletion, got ${responseStatus}`);
  console.log('✔ Verified forged audit log cannot cause arbitrary workout deletion.\n');

  // -------------------------------------------------------------
  // TEST 3: Creation audit entry targeting another user's workout is rejected
  // -------------------------------------------------------------
  console.log('--- TEST 3: Creation audit entry targeting another user\'s workout is rejected ---');
  let crossTenantBlocked = false;
  try {
    // Authenticated as otherUid, attempting to rollback authUid's workout creation
    executeRollbackValidation(otherUid, targetWorkoutId, liveCreatedWorkout, legitimateCreationAuditLog);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      crossTenantBlocked = true;
    }
  }
  assert(crossTenantBlocked, 'Cross-tenant creation rollback must be rejected with UNAUTHORIZED');
  console.log('✔ Verified cross-tenant workout creation rollback is strictly unauthorized.\n');

  // -------------------------------------------------------------
  // TEST 4: Creation audit entry with incorrect targetEntityId is rejected
  // -------------------------------------------------------------
  console.log('--- TEST 4: Creation audit entry with mismatched targetEntityId is rejected ---');
  const mismatchedTargetLog = {
    ...legitimateCreationAuditLog,
    targetEntityId: 'other_workout_999'
  };

  let targetMismatchBlocked = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveCreatedWorkout, mismatchedTargetLog);
  } catch (err: any) {
    if (err.message.includes('INVALID_AUDIT_LOG_TARGET')) {
      targetMismatchBlocked = true;
    }
  }
  assert(targetMismatchBlocked, 'Mismatched targetEntityId must be rejected');
  console.log('✔ Verified mismatched targetEntityId is rejected.\n');

  // -------------------------------------------------------------
  // TEST 5: Creation audit entry with incorrect resultVersion is rejected
  // -------------------------------------------------------------
  console.log('--- TEST 5: Creation audit entry with incorrect resultVersion is rejected ---');
  // Workout has evolved to v2, so creation log (resultVersion=1) is no longer contiguous
  const evolvedWorkout = {
    ...liveCreatedWorkout,
    version: 2
  };

  let versionMismatchBlocked = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, evolvedWorkout, legitimateCreationAuditLog);
  } catch (err: any) {
    if (err.message.includes('NON_CONTIGUOUS')) {
      versionMismatchBlocked = true;
    }
  }
  assert(versionMismatchBlocked, 'Non-contiguous creation rollback must be rejected with NON_CONTIGUOUS');
  console.log('✔ Verified non-contiguous creation rollback is safely rejected.\n');

  // -------------------------------------------------------------
  // TEST 6: Normal update rollback still restores valid previous workout state
  // -------------------------------------------------------------
  console.log('--- TEST 6: Normal update rollback still restores valid previous workout state ---');
  const liveUpdatedWorkout = {
    id: targetWorkoutId,
    userId: authUid,
    title: 'Updated Workout Title',
    scheduledDate: '2026-09-10',
    status: 'IN_PROGRESS',
    sets: [
      { id: 's1', exercise: 'Bench Press', weight: 100, reps: 5, rir: 1, completed: true },
      { id: 's2', exercise: 'Incline Dumbbell Press', weight: 30, reps: 10, rir: 2, completed: true }
    ],
    version: 2,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:30:00.000Z'
  };

  const legitimateUpdateAuditLog = {
    id: 'audit_update_002',
    mutationId: 'mut_update_002',
    userId: authUid,
    actor: 'USER',
    action: 'UPDATE',
    mutationType: 'UPDATE_WORKOUT',
    targetEntityType: 'WORKOUT',
    targetEntityId: targetWorkoutId,
    baseVersion: 1,
    resultVersion: 2,
    summary: 'Updated workout routine',
    inverseDelta: {
      title: 'Morning Push Routine',
      status: 'PLANNED',
      sets: [
        { id: 's1', exercise: 'Bench Press', weight: 80, reps: 10, rir: 2, completed: true }
      ]
    },
    createdAt: '2026-09-10T10:30:00.000Z'
  };

  const restoredDecision = executeRollbackValidation(authUid, targetWorkoutId, liveUpdatedWorkout, legitimateUpdateAuditLog);
  assert(restoredDecision.action === 'RESTORE', 'Expected action RESTORE');
  const restoredWorkout: any = restoredDecision;
  assert(restoredWorkout.title === 'Morning Push Routine', 'Title must be restored to base version state');
  assert(restoredWorkout.status === 'PLANNED', 'Status must be restored to PLANNED');
  assert(restoredWorkout.sets.length === 1, 'Sets must be restored to 1 set');
  assert(restoredWorkout.sets[0].weight === 80, 'Restored set weight must be 80kg');
  assert(restoredWorkout.version === 3, 'Restored workout version must be incremented to 3');
  console.log('✔ Verified update rollback functions cleanly and preserves valid previous state.\n');

  // -------------------------------------------------------------
  // TEST 7: Ambiguous inverseDelta combining deleted=true with state fields is rejected
  // -------------------------------------------------------------
  console.log('--- TEST 7: Ambiguous inverseDelta combining deleted=true with state fields is rejected ---');
  const ambiguousAuditLog = {
    ...legitimateCreationAuditLog,
    inverseDelta: {
      deleted: true,
      title: 'Conflicting Restored Title',
      sets: [{ id: 's1', exercise: 'Squat', weight: 100, reps: 5, completed: true }]
    }
  };

  let ambiguousBlocked = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveCreatedWorkout, ambiguousAuditLog);
  } catch (err: any) {
    if (err.message.includes('STRUCTURALLY_AMBIGUOUS_INVERSE_DELTA')) {
      ambiguousBlocked = true;
    }
  }
  assert(ambiguousBlocked, 'Ambiguous inverseDelta combining deleted=true and state fields must be rejected');

  // Also verify audit log with deleted=false is rejected
  const falseDeletedAuditLog = {
    ...legitimateCreationAuditLog,
    action: 'UPDATE',
    mutationType: 'UPDATE_WORKOUT',
    baseVersion: 1,
    resultVersion: 2,
    inverseDelta: {
      deleted: false,
      title: 'Morning Push Routine'
    }
  };

  let falseDeletedBlocked = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, { ...liveCreatedWorkout, version: 2 }, falseDeletedAuditLog);
  } catch (err: any) {
    if (err.message.includes('STRUCTURALLY_AMBIGUOUS_INVERSE_DELTA')) {
      falseDeletedBlocked = true;
    }
  }
  assert(falseDeletedBlocked, 'Inverse delta containing deleted=false must be rejected as structurally ambiguous');
  console.log('✔ Verified ambiguous combinations of deleted=true with other fields are strictly rejected.\n');

  console.log('================================================================');
  console.log('🎉 ALL 7 WORKOUT CREATION ROLLBACK REGRESSION TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runCreationRollbackTests().catch((err) => {
  console.error('❌ CREATION ROLLBACK TEST FAILED:', err);
  process.exit(1);
});
