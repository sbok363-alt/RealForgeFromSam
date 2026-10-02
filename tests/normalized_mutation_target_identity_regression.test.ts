import { handleMutationsExecute, setAdminAuthForTesting } from '../server';
import { executeBrainAction } from '../src/ai/progressBrain';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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
    },
  };
}

function days() {
  return [
    {
      id: 'day_1',
      name: 'Upper',
      exercises: [
        {
          id: 'pe_1',
          exerciseId: 'bench_press',
          targetSets: 3,
          targetRepsMin: 6,
          targetRepsMax: 8,
        },
      ],
    },
  ];
}

async function runNormalizedTargetIdentityRegression() {
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_user_a') return { uid: 'user_A' };
      const error: any = new Error('Invalid token');
      error.status = 401;
      throw error;
    },
  });

  // 1. Server plan mutation: whitespace must not let ownership lookup miss the real plan.
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('plans', 'plan_victim', {
      id: 'plan_victim',
      userId: 'user_B',
      name: 'Victim Plan',
      weeklyFrequency: 4,
      isActive: true,
      days: days(),
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'MODIFY_TRAINING_PLAN',
        envelope: {
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            planId: '  plan_victim  ',
            name: 'TAKEOVER',
            days: days(),
          },
        },
      },
      storageAdapter: storage,
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, `padded foreign plan id must be rejected with 403, got ${res.statusCode}`);
    const after = await storage.findExistingEntity('plans', 'plan_victim');
    assert(after?.userId === 'user_B', 'victim plan ownership must remain user_B');
    assert(after?.name === 'Victim Plan', 'victim plan contents must remain unchanged');
    assert(storage.getAuditLogs().length === 0, 'rejected padded plan mutation must not create audit state');
    assert(storage.getIdempotencyRecords().length === 0, 'rejected padded plan mutation must not create idempotency state');
  }

  // 2. Brain plan mutation: same padded-id bypass must be closed on the AI path.
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('plans', 'plan_brain_victim', {
      id: 'plan_brain_victim',
      userId: 'user_B',
      name: 'Brain Victim',
      weeklyFrequency: 4,
      isActive: true,
      days: days(),
    });

    const result = await executeBrainAction(
      {
        name: 'proposePlanModification',
        args: {
          planId: '  plan_brain_victim  ',
          name: 'BRAIN TAKEOVER',
          days: days(),
          rationale: 'Adversarial padded identifier probe.',
        },
      },
      {
        authenticatedUserId: 'user_A',
        storageAdapter: storage,
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
      }
    );

    assert(result.success === false, 'Brain padded foreign plan id must be rejected');
    assert(
      typeof result.error === 'string' && /Authorization failed|does not own/i.test(result.error),
      `expected authorization failure, got ${result.error}`
    );
    const after = await storage.findExistingEntity('plans', 'plan_brain_victim');
    assert(after?.userId === 'user_B', 'Brain victim ownership must remain user_B');
    assert(after?.name === 'Brain Victim', 'Brain victim contents must remain unchanged');
  }

  // 3. LOG_SET: audit/idempotency identity must use the same trimmed workout id as the write.
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', 'w_trimmed', {
      id: 'w_trimmed',
      userId: 'user_A',
      title: 'Trim Test',
      scheduledDate: '2026-10-02',
      status: 'IN_PROGRESS',
      version: 1,
      sets: [],
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'LOG_SET',
        envelope: {
          idempotencyKey: '99999999-9999-4999-8999-999999999999',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            workoutId: '  w_trimmed  ',
            exerciseId: '  bench_press  ',
            weightKg: 80,
            reps: 8,
            rir: 2,
          },
        },
      },
      storageAdapter: storage,
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 200, `padded owned workout id must succeed, got ${res.statusCode}`);
    const updated = await storage.findExistingEntity('workouts', 'w_trimmed');
    assert(updated?.version === 2, 'canonical workout must be updated');
    assert(updated?.sets?.[0]?.exercise === 'bench_press', 'validated exercise id must be trimmed');
    assert((await storage.findExistingEntity('workouts', '  w_trimmed  ')) === null, 'padded workout id must never be persisted');

    const audits = storage.getAuditLogs();
    assert(audits.length === 1, 'LOG_SET must create one secure audit record');
    assert(audits[0].targetEntityType === 'WORKOUT', 'LOG_SET audit type must be canonical WORKOUT');
    assert(audits[0].targetEntityId === 'w_trimmed', 'LOG_SET audit target must be trimmed canonical workout id');

    const idempotency = storage.getIdempotencyRecords();
    assert(idempotency[0]?.targetId === 'w_trimmed', 'LOG_SET idempotency target must be canonical workout id');
  }

  // 4. Brain progression: whitespace must resolve to the canonical physical target before ownership.
  {
    const canonicalTargetId = 'target_user_A_bench_press';
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('targets_1rm', canonicalTargetId, {
      id: canonicalTargetId,
      userId: 'user_B',
      exerciseId: 'bench_press',
      targetWeightKg: 80,
      targetRepsMin: 6,
      targetRepsMax: 8,
      action: 'MAINTAIN',
      rationale: 'Foreign target',
    });

    const result = await executeBrainAction(
      {
        name: 'proposeProgressionUpdate',
        args: {
          exerciseId: '  bench_press  ',
          targetWeightKg: 82.5,
          targetRepsMin: 6,
          targetRepsMax: 8,
          suggestedRir: 2,
          action: 'INCREASE_WEIGHT',
          rationale: 'Adversarial padded identifier probe.',
        },
      },
      {
        authenticatedUserId: 'user_A',
        storageAdapter: storage,
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }
    );

    assert(result.success === false, 'Brain padded target id must honor canonical target ownership');
    const canonical = await storage.findExistingEntity('targets_1rm', canonicalTargetId);
    assert(canonical?.userId === 'user_B', 'canonical foreign target must remain untouched');
    assert(canonical?.targetWeightKg === 80, 'canonical foreign target value must remain unchanged');
    assert(
      (await storage.findExistingEntity('targets_1rm', 'target_user_A_  bench_press  ')) === null,
      'padded duplicate progression target must not be created'
    );
  }

  console.log('Normalized mutation target identity regression passed');
}

runNormalizedTargetIdentityRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
