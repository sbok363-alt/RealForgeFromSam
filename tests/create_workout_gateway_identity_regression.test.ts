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

function createRequest(storage: InMemoryMutationStorageAdapter, key: string, planId?: string) {
  return {
    headers: { authorization: 'Bearer token_user_a' },
    body: {
      mutationType: 'CREATE_WORKOUT_SESSION',
      envelope: {
        idempotencyKey: key,
        userId: 'user_A',
        source: 'USER_INPUT',
        timestamp: new Date().toISOString(),
        payload: {
          title: 'Gateway Workout',
          scheduledDate: '2026-10-03',
          status: 'PLANNED',
          sets: [],
          ...(planId ? { planId } : {}),
        },
      },
    },
    storageAdapter: storage,
  };
}

async function runCreateWorkoutGatewayIdentityRegression() {
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_user_a') return { uid: 'user_A' };
      const error: any = new Error('Invalid token');
      error.status = 401;
      throw error;
    },
  });

  const key = '55555555-5555-4555-8555-555555555555';
  const expectedWorkoutId = `w_${key}`;

  // Creation with a planId must still target the created workout, never the plan.
  {
    const storage = new InMemoryMutationStorageAdapter();
    const req = createRequest(storage, key, 'plan_source_123');
    const res = createMockRes();

    await handleMutationsExecute(req, res);

    assert(res.statusCode === 200, `creation must succeed, got ${res.statusCode}`);
    assert(res.body?.success === true, 'creation must report success');
    assert(res.body?.data?.id === expectedWorkoutId, 'created workout id must derive from idempotency key');
    assert(res.body?.data?.planId === 'plan_source_123', 'source plan id must be preserved as data only');

    const stored = await storage.findExistingEntity('workouts', expectedWorkoutId);
    assert(stored?.id === expectedWorkoutId, 'workout must persist under the exact audit/idempotency target');
    assert(stored?.userId === 'user_A', 'created workout must belong to authenticated user');

    const audits = storage.getAuditLogs();
    assert(audits.length === 1, `creation must write one audit entry, got ${audits.length}`);
    assert(audits[0].targetEntityType === 'WORKOUT', 'audit-facing type must remain WORKOUT');
    assert(audits[0].targetEntityId === expectedWorkoutId, 'audit must target the created workout');
    assert(audits[0].beforeState === null, 'creation audit beforeState must be null');
    assert(audits[0].afterState?.id === expectedWorkoutId, 'creation audit afterState must contain created workout');

    const idempotency = storage.getIdempotencyRecords();
    assert(idempotency.length === 1, 'creation must write one idempotency record');
    assert(idempotency[0].targetId === expectedWorkoutId, 'idempotency record must target created workout');

    // Exact replay returns the same workout identity and must not append duplicate audit/idempotency state.
    const replayRes = createMockRes();
    await handleMutationsExecute(req, replayRes);

    assert(replayRes.statusCode === 200, 'exact replay must succeed');
    assert(replayRes.body?.idempotentReplay === true, 'second identical request must be an idempotent replay');
    assert(replayRes.body?.data?.id === expectedWorkoutId, 'replay must return the original workout id');
    assert(storage.getAuditLogs().length === 1, 'replay must not append a second audit log');
    assert(storage.getIdempotencyRecords().length === 1, 'replay must not append idempotency state');
  }

  // If the deterministic creation id already belongs to another user, creation must fail closed.
  {
    const collisionKey = '66666666-6666-4666-8666-666666666666';
    const collisionId = `w_${collisionKey}`;
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity('workouts', collisionId, {
      id: collisionId,
      userId: 'user_B',
      title: 'Foreign Workout',
      scheduledDate: '2026-10-01',
      status: 'PLANNED',
      version: 1,
      sets: [],
    });

    const req = createRequest(storage, collisionKey);
    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 403, `foreign-id collision must be rejected with 403, got ${res.statusCode}`);
    assert(res.body?.success === false, 'foreign-id collision must fail');

    const after = await storage.findExistingEntity('workouts', collisionId);
    assert(after?.userId === 'user_B', 'foreign workout ownership must remain unchanged');
    assert(after?.title === 'Foreign Workout', 'foreign workout contents must remain unchanged');
    assert(storage.getAuditLogs().length === 0, 'rejected collision must not create audit state');
    assert(storage.getIdempotencyRecords().length === 0, 'rejected collision must not create idempotency state');
  }

  console.log('Create-workout gateway identity regression passed');
}

runCreateWorkoutGatewayIdentityRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
