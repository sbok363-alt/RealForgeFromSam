import fs from 'fs';
import path from 'path';
import { isDemoAuthAllowed } from '../src/lib/auth-util';
import { 
  validateCompleteWorkout, 
  executeRollbackValidation,
  validateWorkoutUpdates 
} from '../src/lib/validation';
import { verifyToken } from '../server';
import { Workout, MutationAuditLog } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase0Tests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING PHASE 0 SECURITY REGRESSION SUITE (TESTS A - K) 🛡️');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST A: Client cannot create audit log under mutation_audit_logs
  // -------------------------------------------------------------
  console.log('--- TEST A: Client-authenticated user cannot create audit log ---');
  const firestoreRulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  // Ensure mutation_audit_logs has allow write: if false
  const auditLogRuleMatch = firestoreRulesContent.match(/match\s+\/mutation_audit_logs\/\{[a-zA-Z0-9_-]+\}\s*\{([^}]+)\}/s);
  assert(!!auditLogRuleMatch, 'Firestore rules must define match for /mutation_audit_logs/{logId}');
  const auditRulesBody = auditLogRuleMatch![1];
  assert(
    auditRulesBody.includes('allow write: if false') || 
    (auditRulesBody.includes('allow create: if false') && auditRulesBody.includes('allow update, delete: if false')),
    'mutation_audit_logs must explicitly deny all client writes (allow write: if false)'
  );
  assert(!auditRulesBody.includes('allow create: if isSignedIn()'), 'Client must not have allow create on mutation_audit_logs');
  console.log('✔ Verified firestore.rules completely denies client creation on mutation_audit_logs.\n');

  // -------------------------------------------------------------
  // TEST B: Client cannot directly create a workout under workouts
  // -------------------------------------------------------------
  console.log('--- TEST B: Client-authenticated user cannot directly create workout ---');
  const workoutRuleMatch = firestoreRulesContent.match(/match\s+\/workouts\/\{[a-zA-Z0-9_-]+\}\s*\{([^}]+)\}/s);
  assert(!!workoutRuleMatch, 'Firestore rules must define match for /workouts/{workoutId}');
  const workoutRulesBody = workoutRuleMatch![1];
  assert(
    workoutRulesBody.includes('allow write: if false') ||
    (workoutRulesBody.includes('allow create: if false') && workoutRulesBody.includes('allow update, delete: if false')),
    'workouts must explicitly deny all client writes (allow write: if false)'
  );
  assert(!workoutRulesBody.includes('allow create: if isSignedIn()'), 'Client must not have allow create on workouts');
  console.log('✔ Verified firestore.rules completely denies direct client creation on workouts.\n');

  // -------------------------------------------------------------
  // TEST C: demo-token is rejected when production mode is enabled
  // -------------------------------------------------------------
  console.log('--- TEST C: demo-token is rejected in production mode ---');
  const origEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_AUTH = 'true'; // Even with explicit flag set
    assert(isDemoAuthAllowed() === false, 'isDemoAuthAllowed must be false when NODE_ENV is production');

    let tokenRejected = false;
    try {
      // Calling verifyToken in production mode with demo-token
      await verifyToken('demo-token');
    } catch (err: any) {
      tokenRejected = true;
      assert(err.message.includes('Demo authentication is disabled'), 'Expected error indicating demo auth is disabled');
    }
    assert(tokenRejected, 'verifyToken must reject demo-token when NODE_ENV is production');
  } finally {
    process.env = { ...origEnv };
  }
  console.log('✔ Verified demo-token is strictly rejected when NODE_ENV is production.\n');

  // -------------------------------------------------------------
  // TEST D: demo-token rejected unless explicit demo auth enabled
  // -------------------------------------------------------------
  console.log('--- TEST D: demo-token rejected unless ALLOW_DEMO_AUTH is true ---');
  try {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEMO_AUTH = 'false';
    assert(isDemoAuthAllowed() === false, 'isDemoAuthAllowed must be false when ALLOW_DEMO_AUTH is false');

    let tokenRejected = false;
    try {
      await verifyToken('demo-token');
    } catch (err: any) {
      tokenRejected = true;
      assert(err.message.includes('Demo authentication is disabled'), 'Expected error indicating demo auth is disabled');
    }
    assert(tokenRejected, 'verifyToken must reject demo-token when ALLOW_DEMO_AUTH is false');

    delete process.env.ALLOW_DEMO_AUTH;
    assert(isDemoAuthAllowed() === false, 'isDemoAuthAllowed must be false when ALLOW_DEMO_AUTH is omitted');
  } finally {
    process.env = { ...origEnv };
  }
  console.log('✔ Verified demo-token is rejected unless explicit ALLOW_DEMO_AUTH=true is set.\n');

  // -------------------------------------------------------------
  // TEST E: Forged audit log with malicious inverseDelta is rejected
  // -------------------------------------------------------------
  console.log('--- TEST E: Forged audit log containing malicious payload is blocked ---');
  const authUid = 'athlete_user_100';
  const targetWorkoutId = 'w_target_100';

  const liveWorkoutBase: Workout = {
    id: targetWorkoutId,
    userId: authUid,
    title: 'Heavy Bench Session',
    scheduledDate: '2026-09-10',
    status: 'COMPLETED',
    version: 2,
    sets: [
      { id: 's1', exercise: 'Bench Press', weight: 100, reps: 5, completed: true }
    ],
    updatedAt: new Date().toISOString()
  };

  // Attack payload attempting arbitrary property injection, privilege escalation, or script tags
  const maliciousAuditLog = {
    id: 'log_malicious_1',
    userId: authUid,
    targetEntityId: targetWorkoutId,
    targetEntityType: 'WORKOUT',
    baseVersion: 1,
    resultVersion: 2,
    inverseDelta: {
      title: 'Hacked Workout Title',
      arbitraryInjectedField: 'malicious_content',
      adminPrivileges: true,
      roles: ['SUPER_ADMIN'],
      __proto__: { polluted: true }
    }
  };

  const sanitizedResult = executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, maliciousAuditLog) as any;
  assert((sanitizedResult as any).arbitraryInjectedField === undefined, 'Arbitrary injected fields must be stripped');
  assert((sanitizedResult as any).adminPrivileges === undefined, 'Privilege escalation fields must be stripped');
  assert((sanitizedResult as any).roles === undefined, 'Roles injection must be stripped');
  assert(sanitizedResult.userId === authUid, 'Workout userId must remain strictly the authenticated UID');
  assert(sanitizedResult.id === targetWorkoutId, 'Workout id must remain strictly the target workout id');
  assert(sanitizedResult.version === 3, 'Version must be incremented to 3');
  console.log('✔ Verified malicious or arbitrary fields in inverseDelta are eliminated.\n');

  // -------------------------------------------------------------
  // TEST F: Rollback rejects invalid set structures
  // -------------------------------------------------------------
  console.log('--- TEST F: Rollback rejects invalid set structures ---');

  // F.1: Negative weight
  let rejectedNegWeight = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, {
      id: 'log_bad_weight',
      userId: authUid,
      targetEntityId: targetWorkoutId,
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: {
        sets: [{ id: 's1', exercise: 'Bench', weight: -20, reps: 5 }]
      }
    });
  } catch (e: any) {
    rejectedNegWeight = true;
    assert(e.message.includes('weight must be a finite number between 0 and 1000kg'), `Unexpected error: ${e.message}`);
  }
  assert(rejectedNegWeight, 'Rollback must reject negative weight');

  // F.2: Reps out of bounds
  let rejectedBadReps = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, {
      id: 'log_bad_reps',
      userId: authUid,
      targetEntityId: targetWorkoutId,
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: {
        sets: [{ id: 's1', exercise: 'Bench', weight: 80, reps: -1 }]
      }
    });
  } catch (e: any) {
    rejectedBadReps = true;
    assert(e.message.includes('reps must be an integer between 1 and 200'), `Unexpected error: ${e.message}`);
  }
  assert(rejectedBadReps, 'Rollback must reject invalid reps');

  // F.3: RIR out of range (> 10)
  let rejectedBadRir = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, {
      id: 'log_bad_rir',
      userId: authUid,
      targetEntityId: targetWorkoutId,
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: {
        sets: [{ id: 's1', exercise: 'Bench', weight: 80, reps: 5, rir: 25 }]
      }
    });
  } catch (e: any) {
    rejectedBadRir = true;
    assert(e.message.includes('RIR must be between 0 and 10'), `Unexpected error: ${e.message}`);
  }
  assert(rejectedBadRir, 'Rollback must reject RIR > 10');
  console.log('✔ Verified rollback rejects negative weight, invalid reps, and invalid RIR.\n');

  // -------------------------------------------------------------
  // TEST G: Rollback cannot change workout userId
  // -------------------------------------------------------------
  console.log('--- TEST G: Rollback cannot change workout userId ---');
  const forgedUserAuditLog = {
    id: 'log_user_spoof',
    userId: authUid,
    targetEntityId: targetWorkoutId,
    targetEntityType: 'WORKOUT',
    baseVersion: 1,
    resultVersion: 2,
    inverseDelta: {
      userId: 'victim_user_999',
      title: 'Restored Title'
    }
  };
  const resultG = executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, forgedUserAuditLog) as any;
  assert(resultG.userId === authUid, `Expected userId ${authUid}, but got ${resultG.userId}`);
  console.log('✔ Verified workout userId cannot be changed via rollback.\n');

  // -------------------------------------------------------------
  // TEST H: Rollback cannot change workout id
  // -------------------------------------------------------------
  console.log('--- TEST H: Rollback cannot change workout id ---');
  const forgedIdAuditLog = {
    id: 'log_id_spoof',
    userId: authUid,
    targetEntityId: targetWorkoutId,
    targetEntityType: 'WORKOUT',
    baseVersion: 1,
    resultVersion: 2,
    inverseDelta: {
      id: 'other_workout_999',
      title: 'Restored Title'
    }
  };
  const resultH = executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, forgedIdAuditLog) as any;
  assert(resultH.id === targetWorkoutId, `Expected id ${targetWorkoutId}, but got ${resultH.id}`);
  console.log('✔ Verified workout id cannot be changed via rollback.\n');

  // -------------------------------------------------------------
  // TEST I: Cross-tenant rollback is rejected
  // -------------------------------------------------------------
  console.log('--- TEST I: Cross-tenant rollback attempts are rejected ---');

  // I.1: Audit log belongs to another user
  let rejectedAuditLogCrossTenant = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, {
      id: 'log_other_user',
      userId: 'attacker_user_666',
      targetEntityId: targetWorkoutId,
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: { title: 'Previous' }
    });
  } catch (e: any) {
    rejectedAuditLogCrossTenant = true;
    assert(e.message === 'UNAUTHORIZED', `Expected UNAUTHORIZED, got: ${e.message}`);
  }
  assert(rejectedAuditLogCrossTenant, 'Must reject audit log belonging to another user');

  // I.2: Workout belongs to another user
  let rejectedWorkoutCrossTenant = false;
  try {
    const otherUserWorkout: Workout = {
      ...liveWorkoutBase,
      userId: 'other_user_555'
    };
    executeRollbackValidation(authUid, targetWorkoutId, otherUserWorkout, {
      id: 'log_own',
      userId: authUid,
      targetEntityId: targetWorkoutId,
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: { title: 'Previous' }
    });
  } catch (e: any) {
    rejectedWorkoutCrossTenant = true;
    assert(e.message === 'UNAUTHORIZED', `Expected UNAUTHORIZED, got: ${e.message}`);
  }
  assert(rejectedWorkoutCrossTenant, 'Must reject workout belonging to another user');

  // I.3: Audit log references a different workout
  let rejectedAuditLogTargetMismatch = false;
  try {
    executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, {
      id: 'log_diff_target',
      userId: authUid,
      targetEntityId: 'w_different_workout_777',
      targetEntityType: 'WORKOUT',
      baseVersion: 1,
      resultVersion: 2,
      inverseDelta: { title: 'Previous' }
    });
  } catch (e: any) {
    rejectedAuditLogTargetMismatch = true;
    assert(e.message.includes('INVALID_AUDIT_LOG_TARGET'), `Expected INVALID_AUDIT_LOG_TARGET, got: ${e.message}`);
  }
  assert(rejectedAuditLogTargetMismatch, 'Must reject audit log that references a different workout');
  console.log('✔ Verified cross-tenant audit log and workout operations are strictly unauthorized.\n');

  // -------------------------------------------------------------
  // TEST J: Legitimate rollback succeeds with restored state
  // -------------------------------------------------------------
  console.log('--- TEST J: Legitimate rollback works correctly ---');
  const legitimateAuditLog = {
    id: 'log_legit_100',
    userId: authUid,
    targetEntityId: targetWorkoutId,
    targetEntityType: 'WORKOUT',
    baseVersion: 1,
    resultVersion: 2,
    summary: 'Overload increase',
    inverseDelta: {
      title: 'Bench Session Baseline',
      status: 'PLANNED',
      sets: [
        { id: 's1', exercise: 'Bench Press', weight: 95, reps: 5, rir: 2, completed: true }
      ]
    }
  };

  const restoredJ = executeRollbackValidation(authUid, targetWorkoutId, liveWorkoutBase, legitimateAuditLog) as any;
  assert(restoredJ.title === 'Bench Session Baseline', 'Title should be restored to base state');
  assert(restoredJ.sets[0].weight === 95, 'Weight should be restored to 95kg');
  assert(restoredJ.sets[0].rir === 2, 'RIR should be restored to 2');
  assert(restoredJ.version === 3, 'Version should increment to next OCC number');
  assert(restoredJ.userId === authUid, 'User ID must remain authenticated UID');
  assert(restoredJ.id === targetWorkoutId, 'Workout ID must remain target ID');
  console.log('✔ Verified valid rollback restores state cleanly with incremented version.\n');

  // -------------------------------------------------------------
  // TEST K: OCC & version contiguity remain intact
  // -------------------------------------------------------------
  console.log('--- TEST K: OCC version contiguity is enforced ---');

  // Attempting rollback on stale workout (e.g. workout is at v3, but audit log resulted in v2)
  let rejectedNonContiguous = false;
  try {
    const staleLiveWorkout: Workout = {
      ...liveWorkoutBase,
      version: 3 // Workout was further modified
    };
    executeRollbackValidation(authUid, targetWorkoutId, staleLiveWorkout, legitimateAuditLog); // Audit log is for v2
  } catch (e: any) {
    rejectedNonContiguous = true;
    assert(e.message.startsWith('NON_CONTIGUOUS:'), `Expected NON_CONTIGUOUS error, got: ${e.message}`);
  }
  assert(rejectedNonContiguous, 'Rollback must reject non-contiguous version mismatch');
  console.log('✔ Verified OCC contiguity lock protects against non-contiguous rollback overwrite.\n');

  console.log('================================================================');
  console.log('🎉 ALL PHASE 0 SECURITY REGRESSION TESTS PASSED (100% GREEN) 🎉');
  console.log('================================================================\n');
}

runPhase0Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

