import {
  LogSetInputSchema,
  CreateWorkoutSessionSchema,
  UpdateTargetProgressionSchema,
  ModifyTrainingPlanSchema,
  createMutationEnvelopeSchema,
  executeSecureMutation,
  InMemoryMutationStorageAdapter,
  MutationEnvelope,
} from '../src/domain/mutations';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 RUNNING PHASE 2 SECURE MUTATION PIPELINE & ZOD VALIDATION TESTS 🧪\n');

  // ==========================================
  // 1. Zod Input Schemas for Workout Operations
  // ==========================================
  console.log('--- 1. LogSetInputSchema Tests ---');

  // Valid set
  const validSet = LogSetInputSchema.parse({
    exerciseId: 'ex_bench_press',
    weightKg: 100,
    reps: 5,
    rir: 2,
    rpe: 8,
    completedAt: '2026-09-06T12:00:00Z',
    setType: 'N',
    notes: 'Clean paused reps',
  });
  assert(validSet.exerciseId === 'ex_bench_press', 'Valid exerciseId parsed');
  assert(validSet.weightKg === 100, 'Valid weightKg parsed');
  assert(validSet.reps === 5, 'Valid reps parsed');
  assert(validSet.rir === 2, 'Valid rir parsed');
  console.log('✔ Valid set execution accepted');

  // Negative weight rejected
  let negWeightPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: -10,
      reps: 5,
    });
    negWeightPassed = true;
  } catch (e) {}
  assert(!negWeightPassed, 'Negative weight must be rejected');
  console.log('✔ Negative weight rejected');

  // NaN weight rejected
  let nanWeightPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: NaN,
      reps: 5,
    });
    nanWeightPassed = true;
  } catch (e) {}
  assert(!nanWeightPassed, 'NaN weight must be rejected');
  console.log('✔ NaN weight rejected');

  // Weight > 1000kg rejected
  let giantWeightPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: 1001,
      reps: 5,
    });
    giantWeightPassed = true;
  } catch (e) {}
  assert(!giantWeightPassed, 'Weight > 1000kg must be rejected');
  console.log('✔ Weight > 1000kg rejected');

  // Decimal reps rejected
  let decimalRepsPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: 100,
      reps: 5.5,
    });
    decimalRepsPassed = true;
  } catch (e) {}
  assert(!decimalRepsPassed, 'Decimal reps must be rejected');
  console.log('✔ Decimal reps rejected');

  // Zero reps rejected
  let zeroRepsPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: 100,
      reps: 0,
    });
    zeroRepsPassed = true;
  } catch (e) {}
  assert(!zeroRepsPassed, 'Zero reps must be rejected');
  console.log('✔ Zero reps rejected');

  // RIR > 10 rejected
  let badRirPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: 'ex_bench_press',
      weightKg: 100,
      reps: 5,
      rir: 11,
    });
    badRirPassed = true;
  } catch (e) {}
  assert(!badRirPassed, 'RIR > 10 must be rejected');
  console.log('✔ RIR > 10 rejected');

  // Empty exerciseId rejected
  let emptyExPassed = false;
  try {
    LogSetInputSchema.parse({
      exerciseId: '   ',
      weightKg: 100,
      reps: 5,
    });
    emptyExPassed = true;
  } catch (e) {}
  assert(!emptyExPassed, 'Empty exerciseId must be rejected');
  console.log('✔ Empty exerciseId rejected');

  // --- CreateWorkoutSessionSchema Tests ---
  console.log('\n--- 2. CreateWorkoutSessionSchema Tests ---');

  const validSession = CreateWorkoutSessionSchema.parse({
    title: 'Push Day A',
    scheduledDate: '2026-09-06',
    status: 'PLANNED',
    sets: [
      {
        exerciseId: 'ex_bench_press',
        weightKg: 100,
        reps: 5,
        rir: 2,
      },
    ],
    durationMinutes: 60,
  });
  assert(validSession.title === 'Push Day A', 'Valid session title parsed');
  assert(validSession.sets.length === 1, 'Valid session set parsed');
  console.log('✔ Valid workout session metadata and sets accepted');

  // Empty title rejected
  let emptyTitlePassed = false;
  try {
    CreateWorkoutSessionSchema.parse({
      title: '   ',
      scheduledDate: '2026-09-06',
    });
    emptyTitlePassed = true;
  } catch (e) {}
  assert(!emptyTitlePassed, 'Empty title must be rejected');
  console.log('✔ Empty session title rejected');

  // Invalid date format rejected
  let badDatePassed = false;
  try {
    CreateWorkoutSessionSchema.parse({
      title: 'Leg Day',
      scheduledDate: 'tomorrow',
    });
    badDatePassed = true;
  } catch (e) {}
  assert(!badDatePassed, 'Invalid date format must be rejected');
  console.log('✔ Non-date scheduledDate rejected');

  // Invalid status rejected
  let badStatusPassed = false;
  try {
    CreateWorkoutSessionSchema.parse({
      title: 'Leg Day',
      scheduledDate: '2026-09-06',
      status: 'CANCELLED_FOREVER' as any,
    });
    badStatusPassed = true;
  } catch (e) {}
  assert(!badStatusPassed, 'Invalid status must be rejected');
  console.log('✔ Invalid session status rejected');

  // --- UpdateTargetProgressionSchema Tests ---
  console.log('\n--- 3. UpdateTargetProgressionSchema Tests ---');

  const validProgression = UpdateTargetProgressionSchema.parse({
    exerciseId: 'ex_squat',
    targetWeightKg: 142.5,
    targetRepsMin: 5,
    targetRepsMax: 8,
    suggestedRir: 2,
    action: 'INCREASE_WEIGHT',
    rationale: 'Hit top of rep range (8 reps) across all 3 sets with RIR >= 2.',
  });
  assert(validProgression.targetWeightKg === 142.5, 'Valid target weight parsed');
  console.log('✔ Valid progression target adjustment accepted');

  // targetRepsMax < targetRepsMin rejected
  let invertedRepsPassed = false;
  try {
    UpdateTargetProgressionSchema.parse({
      exerciseId: 'ex_squat',
      targetWeightKg: 142.5,
      targetRepsMin: 10,
      targetRepsMax: 6, // Inverted!
      action: 'INCREASE_WEIGHT',
      rationale: 'Invalid',
    });
    invertedRepsPassed = true;
  } catch (e) {}
  assert(!invertedRepsPassed, 'Inverted target reps (max < min) must be rejected');
  console.log('✔ Inverted rep target range (max < min) rejected');

  // Empty rationale rejected
  let emptyRationalePassed = false;
  try {
    UpdateTargetProgressionSchema.parse({
      exerciseId: 'ex_squat',
      targetWeightKg: 142.5,
      targetRepsMin: 5,
      targetRepsMax: 8,
      action: 'INCREASE_WEIGHT',
      rationale: '   ',
    });
    emptyRationalePassed = true;
  } catch (e) {}
  assert(!emptyRationalePassed, 'Empty rationale must be rejected');
  console.log('✔ Empty progression rationale rejected');

  // --- ModifyTrainingPlanSchema Tests ---
  console.log('\n--- 4. ModifyTrainingPlanSchema Tests ---');

  const validPlan = ModifyTrainingPlanSchema.parse({
    planId: 'plan_hypertrophy_upper_lower',
    name: 'Upper / Lower Split',
    weeklyFrequency: 4,
    isActive: true,
    days: [
      {
        id: 'day_1',
        name: 'Upper A',
        exercises: [
          {
            id: 'pe_1',
            exerciseId: 'ex_bench_press',
            targetSets: 4,
            targetRepsMin: 6,
            targetRepsMax: 8,
          },
        ],
      },
    ],
  });
  assert(validPlan.days.length === 1, 'Plan days parsed');
  console.log('✔ Valid training plan restructuring accepted');

  // Empty days array rejected
  let emptyDaysPassed = false;
  try {
    ModifyTrainingPlanSchema.parse({
      planId: 'plan_1',
      days: [],
    });
    emptyDaysPassed = true;
  } catch (e) {}
  assert(!emptyDaysPassed, 'Plan with 0 days must be rejected');
  console.log('✔ Training plan with zero days rejected');

  // Invalid weekly frequency (>7) rejected
  let badFreqPassed = false;
  try {
    ModifyTrainingPlanSchema.parse({
      planId: 'plan_1',
      weeklyFrequency: 9,
      days: [
        {
          id: 'd1',
          name: 'Day 1',
          exercises: [
            {
              id: 'e1',
              exerciseId: 'ex_1',
              targetSets: 3,
              targetRepsMin: 5,
              targetRepsMax: 5,
            },
          ],
        },
      ],
    });
    badFreqPassed = true;
  } catch (e) {}
  assert(!badFreqPassed, 'Weekly frequency > 7 must be rejected');
  console.log('✔ Weekly frequency > 7 rejected');

  // ==========================================
  // 2. Standardized Mutation Envelope Tests
  // ==========================================
  console.log('\n--- 5. Standardized Mutation Envelope (MutationEnvelope<T>) Tests ---');

  const envelopeSchema = createMutationEnvelopeSchema(LogSetInputSchema);

  // Valid USER_INPUT envelope (reason optional)
  const validUserEnvelope = envelopeSchema.parse({
    idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    userId: 'user_123',
    source: 'USER_INPUT',
    timestamp: new Date().toISOString(),
    payload: {
      exerciseId: 'ex_bench',
      weightKg: 100,
      reps: 5,
      rir: 2,
    },
  });
  assert(validUserEnvelope.source === 'USER_INPUT', 'User envelope parsed');
  console.log('✔ USER_INPUT mutation envelope accepted without reason');

  // Valid AI_BRAIN envelope with required reason
  const validAiEnvelope = envelopeSchema.parse({
    idempotencyKey: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    userId: 'user_123',
    source: 'AI_BRAIN',
    reason: 'RIR 3 across 3 consecutive sessions indicates capacity for progressive overload.',
    timestamp: new Date().toISOString(),
    payload: {
      exerciseId: 'ex_bench',
      weightKg: 102.5,
      reps: 5,
      rir: 2,
    },
  });
  assert(validAiEnvelope.source === 'AI_BRAIN', 'AI envelope parsed');
  assert(typeof validAiEnvelope.reason === 'string', 'AI reason present');
  console.log('✔ AI_BRAIN mutation envelope with explanatory reason accepted');

  // AI_BRAIN envelope MISSING reason rejected
  let aiMissingReasonPassed = false;
  try {
    envelopeSchema.parse({
      idempotencyKey: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      userId: 'user_123',
      source: 'AI_BRAIN',
      timestamp: new Date().toISOString(),
      payload: {
        exerciseId: 'ex_bench',
        weightKg: 102.5,
        reps: 5,
      },
    });
    aiMissingReasonPassed = true;
  } catch (e: any) {
    assert(
      e.message.includes('A non-empty reason is strictly required'),
      'Error message must state that AI_BRAIN requires reason'
    );
  }
  assert(!aiMissingReasonPassed, 'AI_BRAIN envelope without reason must be rejected');
  console.log('✔ AI_BRAIN mutation envelope without reason strictly rejected');

  // AI_BRAIN envelope with empty whitespace reason rejected
  let aiEmptyReasonPassed = false;
  try {
    envelopeSchema.parse({
      idempotencyKey: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      userId: 'user_123',
      source: 'AI_BRAIN',
      reason: '    ',
      timestamp: new Date().toISOString(),
      payload: {
        exerciseId: 'ex_bench',
        weightKg: 102.5,
        reps: 5,
      },
    });
    aiEmptyReasonPassed = true;
  } catch (e) {}
  assert(!aiEmptyReasonPassed, 'AI_BRAIN envelope with whitespace-only reason must be rejected');
  console.log('✔ AI_BRAIN mutation envelope with whitespace-only reason strictly rejected');

  // Invalid UUID for idempotencyKey rejected
  let badUuidPassed = false;
  try {
    envelopeSchema.parse({
      idempotencyKey: 'not-a-valid-uuid',
      userId: 'user_123',
      source: 'USER_INPUT',
      timestamp: new Date().toISOString(),
      payload: {
        exerciseId: 'ex_bench',
        weightKg: 100,
        reps: 5,
      },
    });
    badUuidPassed = true;
  } catch (e) {}
  assert(!badUuidPassed, 'Invalid UUID for idempotencyKey must be rejected');
  console.log('✔ Non-UUIDv4 idempotency key rejected');

  // Invalid ISO timestamp rejected
  let badTimestampPassed = false;
  try {
    envelopeSchema.parse({
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      userId: 'user_123',
      source: 'USER_INPUT',
      timestamp: 'yesterday-at-noon',
      payload: {
        exerciseId: 'ex_bench',
        weightKg: 100,
        reps: 5,
      },
    });
    badTimestampPassed = true;
  } catch (e) {}
  assert(!badTimestampPassed, 'Invalid ISO timestamp must be rejected');
  console.log('✔ Invalid timestamp format rejected');

  // ==========================================
  // 3. Server-Side Execution & Audit Bridge Tests
  // ==========================================
  console.log('\n--- 6. Server-Side Execution & Audit Bridge (executeSecureMutation) Tests ---');

  const storage = new InMemoryMutationStorageAdapter();

  // Test 1: Successful execution
  const rawSetEnvelope = {
    idempotencyKey: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    userId: 'athlete_77',
    source: 'USER_INPUT',
    timestamp: new Date().toISOString(),
    payload: {
      exerciseId: 'ex_deadlift',
      weightKg: 180,
      reps: 5,
      rir: 1,
    },
  };

  const execResult1 = await executeSecureMutation({
    rawEnvelope: rawSetEnvelope,
    payloadSchema: LogSetInputSchema,
    authenticatedUserId: 'athlete_77',
    targetEntityType: 'WORKOUT_SET',
    targetEntityId: 'set_deadlift_1',
    storageAdapter: storage,
    execute: async (payload, ctx) => {
      assert(payload.weightKg === 180, 'Payload passed to execute');
      assert(ctx.authenticatedUserId === 'athlete_77', 'Context auth user correct');
      return { id: 'set_deadlift_1', ...payload, logged: true };
    },
  });

  assert(execResult1.success === true, 'Mutation must succeed');
  assert(execResult1.data.logged === true, 'Mutation data returned');
  assert(execResult1.idempotentReplay === false, 'First execution is not replay');
  assert(typeof execResult1.auditLogId === 'string', 'Audit log ID created');
  console.log('✔ Successful transactional mutation execution verified');

  // Verify Audit Log Entry created
  const auditLogs = storage.getAuditLogs();
  assert(auditLogs.length === 1, 'One audit log entry created');
  assert(auditLogs[0].mutationId === rawSetEnvelope.idempotencyKey, 'Audit log mutationId matches');
  assert(auditLogs[0].source === 'USER_INPUT', 'Audit log source matches');
  assert(auditLogs[0].targetEntityType === 'WORKOUT_SET', 'Audit log entity type matches');
  assert(auditLogs[0].status === 'COMMITTED', 'Audit log status committed');
  console.log('✔ Non-destructive audit log entry recorded with metadata');

  // Test 2: Idempotent Replay (Same key, same user, same payload)
  const execResultReplay = await executeSecureMutation({
    rawEnvelope: rawSetEnvelope,
    payloadSchema: LogSetInputSchema,
    authenticatedUserId: 'athlete_77',
    targetEntityType: 'WORKOUT_SET',
    targetEntityId: 'set_deadlift_1',
    storageAdapter: storage,
    execute: async () => {
      throw new Error('Execute should not be called on idempotent replay!');
    },
  });

  assert(execResultReplay.success === true, 'Replay must return success');
  assert(execResultReplay.idempotentReplay === true, 'Must indicate idempotent replay');
  assert((execResultReplay as any).data.weightKg === 180, 'Replayed cached data returned');
  console.log('✔ Exact replay returns cached result with idempotentReplay flag (no double-execution)');

  // Test 3: Idempotency Conflict (Same key, differing payload)
  const conflictingEnvelope = {
    ...rawSetEnvelope,
    payload: {
      ...rawSetEnvelope.payload,
      weightKg: 220, // Different weight!
    },
  };

  const execResultConflict = await executeSecureMutation({
    rawEnvelope: conflictingEnvelope,
    payloadSchema: LogSetInputSchema,
    authenticatedUserId: 'athlete_77',
    targetEntityType: 'WORKOUT_SET',
    targetEntityId: 'set_deadlift_1',
    storageAdapter: storage,
    execute: async () => ({}),
  });

  assert(execResultConflict.success === false, 'Conflicting payload must fail');
  assert(execResultConflict.error?.includes('Idempotency conflict'), 'Conflict error message returned');
  console.log('✔ Mutation ID re-use with differing payload rejected as Idempotency conflict');

  // Test 4: Cross-Tenant Idempotency Collision Hijack Attempt
  const crossUserEnvelope = {
    ...rawSetEnvelope,
    userId: 'attacker_99',
  };

  const execResultHijack = await executeSecureMutation({
    rawEnvelope: crossUserEnvelope,
    payloadSchema: LogSetInputSchema,
    authenticatedUserId: 'attacker_99',
    targetEntityType: 'WORKOUT_SET',
    targetEntityId: 'set_deadlift_1',
    storageAdapter: storage,
    execute: async () => ({}),
  });

  assert(execResultHijack.success === false, 'Cross-user key collision must be rejected');
  assert(execResultHijack.error?.includes('belongs to another user session'), 'Error must note cross-user collision');
  console.log('✔ Cross-tenant idempotency key hijacking rejected');

  // Test 5: Authentication mismatch (Envelope claims user_A, but authenticated as user_B)
  const spoofedEnvelope = {
    ...rawSetEnvelope,
    idempotencyKey: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    userId: 'victim_victim',
  };

  const execResultSpoof = await executeSecureMutation({
    rawEnvelope: spoofedEnvelope,
    payloadSchema: LogSetInputSchema,
    authenticatedUserId: 'attacker_99', // Mismatched auth token!
    targetEntityType: 'WORKOUT_SET',
    storageAdapter: storage,
    execute: async () => ({}),
  });

  assert(execResultSpoof.success === false, 'Spoofed user must fail');
  assert(execResultSpoof.error?.includes('Authorization failed'), 'Authorization error returned');
  console.log('✔ Envelope userId spoofing blocked by server-verified auth check');

  // Test 6: Target entity ownership check (Modifying an existing entity owned by another user)
  storage.seedEntity('WORKOUT', 'workout_private_1', {
    id: 'workout_private_1',
    userId: 'other_user',
    title: 'Secret Workout',
  });

  const unauthorizedTargetEnvelope = {
    idempotencyKey: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    userId: 'athlete_77',
    source: 'USER_INPUT' as const,
    timestamp: new Date().toISOString(),
    payload: {
      title: 'Hacked Title',
      scheduledDate: '2026-09-06',
    },
  };

  const execResultOwnership = await executeSecureMutation({
    rawEnvelope: unauthorizedTargetEnvelope,
    payloadSchema: CreateWorkoutSessionSchema,
    authenticatedUserId: 'athlete_77',
    targetEntityType: 'WORKOUT',
    targetEntityId: 'workout_private_1',
    storageAdapter: storage,
    execute: async () => ({}),
  });

  assert(execResultOwnership.success === false, 'Modifying another user target must be rejected');
  assert(execResultOwnership.error?.includes('does not own target entity'), 'Ownership rejection message');
  console.log('✔ Ownership authorization enforced (cannot modify target owned by other user)');

  // Test 7: AI_BRAIN mutation execution with audit tracking
  const aiProgressionEnvelope = {
    idempotencyKey: '06eebc99-9c0b-4ef8-bb6d-6bb9bd380a77',
    userId: 'athlete_77',
    source: 'AI_BRAIN' as const,
    reason: 'RIR 2 and target reps achieved for 3 straight sessions. Increment load by +2.5kg.',
    timestamp: new Date().toISOString(),
    payload: {
      exerciseId: 'ex_bench_press',
      targetWeightKg: 102.5,
      targetRepsMin: 5,
      targetRepsMax: 8,
      suggestedRir: 2,
      action: 'INCREASE_WEIGHT' as const,
      rationale: 'RIR 2 and target reps achieved for 3 straight sessions.',
    },
  };

  const execResultAi = await executeSecureMutation({
    rawEnvelope: aiProgressionEnvelope,
    payloadSchema: UpdateTargetProgressionSchema,
    authenticatedUserId: 'athlete_77',
    targetEntityType: 'TARGET_PROGRESSION',
    targetEntityId: 'target_bench',
    storageAdapter: storage,
    execute: async (payload) => {
      return { id: 'target_bench', ...payload, updated: true };
    },
  });

  assert(execResultAi.success === true, 'AI mutation must succeed');
  const aiAuditLog = storage.getAuditLogs().find((l) => l.mutationId === aiProgressionEnvelope.idempotencyKey);
  assert(!!aiAuditLog, 'AI audit log exists');
  assert(aiAuditLog?.source === 'AI_BRAIN', 'Audit log records source AI_BRAIN');
  assert(aiAuditLog?.reason === aiProgressionEnvelope.reason, 'Audit log records AI reasoning');
  console.log('✔ AI_BRAIN mutation executed and audited with source flag and rationale');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 2 MUTATION PIPELINE & ZOD TESTS PASSED (100% GREEN)');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
