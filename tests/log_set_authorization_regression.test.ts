import { handleMutationsExecute, setAdminAuthForTesting } from '../server';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };
}

async function runLogSetAuthorizationRegressionTests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING LOG_SET AUTHORIZATION REGRESSION SUITE (TESTS 1 - 7) 🛡️');
  console.log('================================================================\n');

  // Configure test auth to verify tokens based on test headers
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_user_a') return { uid: 'user_A' };
      if (token === 'token_user_b') return { uid: 'user_B' };
      if (token === 'token_attacker') return { uid: 'attacker_666' };
      const err: any = new Error('Invalid or expired Firebase ID token');
      err.status = 401;
      throw err;
    }
  });

  // ----------------------------------------------------------------------
  // TEST 1: Authenticated user A cannot LOG_SET into user B's workout
  // ----------------------------------------------------------------------
  console.log('--- TEST 1: Authenticated user A cannot LOG_SET into user B\'s workout ---');
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', 'w_user_b_workout', {
      id: 'w_user_b_workout',
      userId: 'user_B',
      title: 'User B Heavy Squats',
      version: 1,
      sets: [
        { id: 's_b1', exercise: 'ex_squat', weight: 140, reps: 5, completed: true }
      ]
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_user_b_workout',
            exerciseId: 'ex_squat',
            weightKg: 200,
            reps: 10,
            rir: 0
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, `Expected HTTP 403 Forbidden, got ${res.statusCode}`);
    assert(res.body.success === false, 'Expected success to be false');
    assert(res.body.error === 'Unauthorized', `Expected generic "Unauthorized" error, got "${res.body.error}"`);
    // Ensure no sensitive info leaked
    assert(!JSON.stringify(res.body).includes('user_B'), 'Must not leak victim UID user_B');

    // Confirm workout in storage remains untouched
    const workoutDoc = await storage.findExistingEntity('workouts', 'w_user_b_workout');
    assert(workoutDoc?.sets.length === 1, 'Workout sets must not be modified by cross-tenant request');
    assert(workoutDoc?.version === 1, 'Workout version must not be incremented');
    console.log('✔ Cross-tenant mutation strictly blocked with HTTP 403 and zero sensitive data leakage.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 2: Authenticated user A can LOG_SET into user A's workout
  // ----------------------------------------------------------------------
  console.log('--- TEST 2: Authenticated user A can LOG_SET into user A\'s workout ---');
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', 'w_user_a_workout', {
      id: 'w_user_a_workout',
      userId: 'user_A',
      title: 'User A Bench Day',
      version: 1,
      sets: []
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_user_a_workout',
            exerciseId: 'ex_bench',
            weightKg: 100,
            reps: 5,
            rir: 2,
            setType: 'N',
            notes: 'Felt solid'
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 200, `Expected HTTP 200, got ${res.statusCode}`);
    assert(res.body.success === true, 'Expected success to be true');
    assert(res.body.data.workoutId === 'w_user_a_workout', 'Expected workoutId in data');
    assert(res.body.data.set.exercise === 'ex_bench', 'Expected set exercise to match');
    assert(res.body.data.set.weight === 100, 'Expected set weight to match');
    assert(res.body.data.set.reps === 5, 'Expected set reps to match');

    // Confirm state in storage was properly updated
    const workoutDoc = await storage.findExistingEntity('workouts', 'w_user_a_workout');
    assert(workoutDoc?.sets.length === 1, 'Workout sets must contain 1 set');
    assert(workoutDoc?.sets[0].exercise === 'ex_bench', 'Recorded set exercise matches');
    assert(workoutDoc?.version === 2, 'Workout version must be incremented to 2');
    console.log('✔ Authorized user successfully logged set with updated version and sets array.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 3: Missing/nonexistent workout is rejected safely
  // ----------------------------------------------------------------------
  console.log('--- TEST 3: Missing/nonexistent workout is rejected safely ---');
  {
    const storage = new InMemoryMutationStorageAdapter();

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_nonexistent_workout_999',
            exerciseId: 'ex_deadlift',
            weightKg: 180,
            reps: 3,
            rir: 1
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 404, `Expected HTTP 404 Not Found, got ${res.statusCode}`);
    assert(res.body.success === false, 'Expected success to be false');
    assert(res.body.error === 'Workout not found', `Expected "Workout not found", got "${res.body.error}"`);
    console.log('✔ Nonexistent workout target safely rejected with HTTP 404.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 4: Client-supplied userId cannot override authenticated UID
  // ----------------------------------------------------------------------
  console.log('--- TEST 4: Client-supplied userId cannot override authenticated UID ---');
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', 'w_user_b_workout', {
      id: 'w_user_b_workout',
      userId: 'user_B',
      title: 'Target Workout',
      version: 1,
      sets: []
    });

    // Sub-test 4A: Attacker sets envelope.userId to victim's UID ('user_B')
    const reqSpoofedEnvelope = {
      headers: { authorization: 'Bearer token_attacker' }, // Auth token produces 'attacker_666'
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '44444444-4444-4444-8444-444444444441',
          userId: 'user_B', // Forged envelope userId!
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_user_b_workout',
            exerciseId: 'ex_press',
            weightKg: 80,
            reps: 5
          }
        }
      },
      storageAdapter: storage
    };

    const res4A = createMockRes();
    await handleMutationsExecute(reqSpoofedEnvelope, res4A);
    assert(res4A.statusCode === 403, `Expected HTTP 403, got ${res4A.statusCode}`);
    assert(res4A.body.error === 'Unauthorized', 'Expected generic Unauthorized error');

    // Sub-test 4B: Attacker includes userId in request body or payload
    const reqSpoofedBody = {
      headers: { authorization: 'Bearer token_attacker' },
      body: {
        userId: 'user_B', // Forged root body userId
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '44444444-4444-4444-8444-444444444442',
          userId: 'attacker_666',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            userId: 'user_B', // Forged payload userId
            workoutId: 'w_user_b_workout',
            exerciseId: 'ex_press',
            weightKg: 80,
            reps: 5
          }
        }
      },
      storageAdapter: storage
    };

    const res4B = createMockRes();
    await handleMutationsExecute(reqSpoofedBody, res4B);
    assert(res4B.statusCode === 403, `Expected HTTP 403, got ${res4B.statusCode}`);
    assert(res4B.body.error === 'Unauthorized', 'Expected generic Unauthorized error');

    const workoutDoc = await storage.findExistingEntity('workouts', 'w_user_b_workout');
    assert(workoutDoc?.sets.length === 0, 'Target workout sets must remain empty');
    console.log('✔ Client-supplied userId overrides blocked at envelope and body levels.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 5: Forged workout ownership field cannot bypass authorization
  // ----------------------------------------------------------------------
  console.log('--- TEST 5: Forged workout ownership field in request cannot bypass authorization ---');
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', 'w_user_b_workout', {
      id: 'w_user_b_workout',
      userId: 'user_B', // Authoritative owner is user_B
      title: 'Target Workout',
      version: 1,
      sets: []
    });

    // Attacker crafts payload claiming workout belongs to attacker_666
    const req = {
      headers: { authorization: 'Bearer token_attacker' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '55555555-5555-4555-8555-555555555555',
          userId: 'attacker_666',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_user_b_workout',
            exerciseId: 'ex_deadlift',
            weightKg: 250,
            reps: 1,
            // Forged ownership objects in payload
            workout: { userId: 'attacker_666' },
            ownerId: 'attacker_666',
            userId: 'attacker_666'
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, `Expected HTTP 403, got ${res.statusCode}`);
    assert(res.body.error === 'Unauthorized', 'Expected generic Unauthorized error');

    const workoutDoc = await storage.findExistingEntity('workouts', 'w_user_b_workout');
    assert(workoutDoc?.sets.length === 0, 'Workout must not be mutated by forged ownership claims');
    console.log('✔ Forged workout ownership fields in payload strictly ignored in favor of authoritative storage.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 6: Authorization checked against authoritative Firestore document
  // ----------------------------------------------------------------------
  console.log('--- TEST 6: Authorization is checked against authoritative storage document ---');
  {
    const storage = new InMemoryMutationStorageAdapter();

    // 6A: Storage doc is verified before any mutation
    let storageReadCount = 0;
    const originalFind = storage.findExistingEntity.bind(storage);
    storage.findExistingEntity = async (entityType: string, entityId: string) => {
      storageReadCount++;
      return originalFind(entityType, entityId);
    };

    storage.seedEntity('workouts', 'w_authoritative_test', {
      id: 'w_authoritative_test',
      userId: 'user_B',
      version: 1,
      sets: []
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_authoritative_test',
            exerciseId: 'ex_bench',
            weightKg: 100,
            reps: 5
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, 'Expected 403 when authoritative doc belongs to user_B');
    assert(storageReadCount >= 1, 'Must read from authoritative storage to perform ownership check');

    // 6B: Transfer ownership in authoritative storage to user_A
    storage.seedEntity('workouts', 'w_authoritative_test', {
      id: 'w_authoritative_test',
      userId: 'user_A', // Now belongs to user_A
      version: 1,
      sets: []
    });

    const reqAuthorized = {
      ...req,
      body: {
        ...req.body,
        envelope: {
          ...req.body.envelope,
          idempotencyKey: '66666666-6666-4666-8666-666666666667'
        }
      }
    };

    const resAuthorized = createMockRes();
    await handleMutationsExecute(reqAuthorized, resAuthorized);

    assert(resAuthorized.statusCode === 200, 'Expected 200 once authoritative doc belongs to user_A');
    const updatedDoc = await storage.findExistingEntity('workouts', 'w_authoritative_test');
    assert(updatedDoc?.sets.length === 1, 'Workout sets updated atomically');
    console.log('✔ Authoritative storage read confirmed as single source of truth for authorization.\n');
  }

  // ----------------------------------------------------------------------
  // TEST 7: Existing valid LOG_SET behavior remains functional
  // ----------------------------------------------------------------------
  console.log('--- TEST 7: Existing valid LOG_SET behavior remains functional ---');
  {
    const storage = new InMemoryMutationStorageAdapter();

    // 7A: Standalone set logging (without workoutId)
    const reqStandalone = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '77777777-7777-4777-8777-777777777771',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            exerciseId: 'ex_deadlift',
            weightKg: 200,
            reps: 5,
            rir: 1
          }
        }
      },
      storageAdapter: storage
    };

    const resStandalone = createMockRes();
    await handleMutationsExecute(reqStandalone, resStandalone);

    assert(resStandalone.statusCode === 200, `Expected 200 for standalone set, got ${resStandalone.statusCode}`);
    assert(resStandalone.body.success === true, 'Standalone set returned success');
    assert(resStandalone.body.data.exerciseId === 'ex_deadlift', 'Returned exerciseId');
    assert(resStandalone.body.data.weightKg === 200, 'Returned weightKg');
    assert(!!resStandalone.body.data.id, 'Returned generated set id');

    // 7B: Logging set with custom setType ('W') and notes into owned workout
    storage.seedEntity('workouts', 'w_user_a_full', {
      id: 'w_user_a_full',
      userId: 'user_A',
      title: 'Full Workout',
      version: 1,
      sets: []
    });

    const reqFull = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '77777777-7777-4777-8777-777777777772',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: 'w_user_a_full',
            exerciseId: 'ex_squat',
            weightKg: 100,
            reps: 8,
            rir: 3,
            rpe: 7,
            setType: 'W',
            notes: 'Warmup set with pause'
          }
        }
      },
      storageAdapter: storage
    };

    const resFull = createMockRes();
    await handleMutationsExecute(reqFull, resFull);

    assert(resFull.statusCode === 200, 'Expected 200 for full workout set');
    assert(resFull.body.data.set.setType === 'W', 'setType preserved');
    assert(resFull.body.data.set.notes === 'Warmup set with pause', 'notes preserved');
    assert(resFull.body.data.set.completed === true, 'completed set flag set');

    // 7C: Idempotent replay of the exact same mutation returns cached result
    const resReplay = createMockRes();
    await handleMutationsExecute(reqFull, resReplay);
    assert(resReplay.statusCode === 200, 'Idempotent replay succeeds with 200');
    assert(resReplay.body.idempotentReplay === true, 'Response indicates idempotent replay');

    // Verify sets array was NOT duplicated on idempotent replay
    const finalDoc = await storage.findExistingEntity('workouts', 'w_user_a_full');
    assert(finalDoc?.sets.length === 1, 'Workout sets must not be duplicated on replay');
    assert(finalDoc?.version === 2, 'Version must remain 2');
    console.log('✔ All existing LOG_SET capabilities (standalone, metadata, idempotency) preserved.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL LOG_SET AUTHORIZATION REGRESSION TESTS PASSED (100% GREEN) 🎉');
  console.log('================================================================');
}

runLogSetAuthorizationRegressionTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
