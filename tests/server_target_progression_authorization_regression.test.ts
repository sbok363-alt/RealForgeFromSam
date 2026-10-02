import { handleMutationsExecute, setAdminAuthForTesting } from '../server';
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

async function runServerTargetProgressionRegression() {
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_user_a') return { uid: 'user_A' };
      const error: any = new Error('Invalid token');
      error.status = 401;
      throw error;
    },
  });

  const targetId = 'target_user_A_bench_press';

  // A persisted target at the physical target id must participate in ownership checks.
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('targets_1rm', targetId, {
      id: targetId,
      userId: 'user_B',
      exerciseId: 'bench_press',
      targetWeightKg: 80,
      targetRepsMin: 6,
      targetRepsMax: 8,
      action: 'MAINTAIN',
      rationale: 'Victim target',
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'UPDATE_TARGET_PROGRESSION',
        envelope: {
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            exerciseId: ' bench_press ',
            targetWeightKg: 90,
            targetRepsMin: 6,
            targetRepsMax: 8,
            suggestedRir: 2,
            action: 'INCREASE_WEIGHT',
            rationale: 'Cross-owner probe',
          },
        },
      },
      storageAdapter: storage,
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, `foreign-owned target must be rejected with 403, got ${res.statusCode}`);
    assert(res.body?.success === false, 'foreign-owned target mutation must fail');

    const after = await storage.findExistingEntity('targets_1rm', targetId);
    assert(after?.userId === 'user_B', 'foreign-owned target ownership must remain unchanged');
    assert(after?.targetWeightKg === 80, 'foreign-owned target contents must remain unchanged');
    assert(storage.getAuditLogs().length === 0, 'rejected target mutation must not create audit state');
    assert(storage.getIdempotencyRecords().length === 0, 'rejected target mutation must not create idempotency state');
  }

  // The legitimate owner path must audit the exact physical target and capture beforeState.
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('targets_1rm', targetId, {
      id: targetId,
      userId: 'user_A',
      exerciseId: 'bench_press',
      targetWeightKg: 80,
      targetRepsMin: 6,
      targetRepsMax: 8,
      action: 'MAINTAIN',
      rationale: 'Before',
    });

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'UPDATE_TARGET_PROGRESSION',
        envelope: {
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            exerciseId: ' bench_press ',
            targetWeightKg: 82.5,
            targetRepsMin: 6,
            targetRepsMax: 8,
            suggestedRir: 2,
            action: 'INCREASE_WEIGHT',
            rationale: 'Owner progression update',
          },
        },
      },
      storageAdapter: storage,
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 200, `owner target update must succeed, got ${res.statusCode}`);
    assert(res.body?.success === true, 'owner target update must report success');

    const after = await storage.findExistingEntity('targets_1rm', targetId);
    assert(after?.targetWeightKg === 82.5, 'owner target update must persist to the physical target id');
    assert(after?.exerciseId === 'bench_press', 'validated/trimmed exerciseId must be persisted');

    const audits = storage.getAuditLogs();
    assert(audits.length === 1, `owner target update must create one audit entry, got ${audits.length}`);
    assert(audits[0].targetEntityType === 'TARGET_PROGRESSION', 'audit-facing entity type must remain stable');
    assert(audits[0].targetEntityId === targetId, 'audit target id must equal the persisted document id');
    assert(audits[0].beforeState?.targetWeightKg === 80, 'audit must capture physical target beforeState');

    const idempotency = storage.getIdempotencyRecords();
    assert(idempotency.length === 1, 'owner target update must create one idempotency record');
    assert(idempotency[0].targetId === targetId, 'idempotency target id must equal the persisted document id');
  }

  console.log('Server target progression authorization/audit regression passed');
}

runServerTargetProgressionRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
