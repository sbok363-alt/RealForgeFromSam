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

async function runModifyTrainingPlanStatePreservationRegression() {
  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_owner') return { uid: 'user_owner' };
      const error: any = new Error('Invalid token');
      error.status = 401;
      throw error;
    },
  });

  const storage = new InMemoryMutationStorageAdapter();
  storage.seedEntity('plans', 'plan_inactive', {
    id: 'plan_inactive',
    userId: 'user_owner',
    name: 'Inactive Plan',
    weeklyFrequency: 3,
    isActive: false,
    days: [
      {
        id: 'day_old',
        name: 'Old Day',
        exercises: [
          {
            id: 'pe_old',
            exerciseId: 'bench_press',
            targetSets: 3,
            targetRepsMin: 6,
            targetRepsMax: 8,
          },
        ],
      },
    ],
  });

  const req = {
    headers: { authorization: 'Bearer token_owner' },
    body: {
      mutationType: 'MODIFY_TRAINING_PLAN',
      envelope: {
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userId: 'user_owner',
        source: 'USER_INPUT',
        timestamp: new Date().toISOString(),
        payload: {
          planId: 'plan_inactive',
          name: 'Inactive Plan Updated',
          weeklyFrequency: 4,
          days: [
            {
              id: 'day_new',
              name: 'New Day',
              exercises: [
                {
                  id: 'pe_new',
                  exerciseId: 'bench_press',
                  targetSets: 2,
                  targetRepsMin: 8,
                  targetRepsMax: 10,
                },
              ],
            },
          ],
        },
      },
    },
    storageAdapter: storage,
  };

  const res = createMockRes();
  await handleMutationsExecute(req, res);

  assert(res.statusCode === 200, `owner plan update must succeed, got ${res.statusCode}`);
  assert(res.body?.success === true, 'owner plan update must report success');

  const after = await storage.findExistingEntity('plans', 'plan_inactive');
  assert(after?.name === 'Inactive Plan Updated', 'requested plan edits must still apply');
  assert(after?.weeklyFrequency === 4, 'requested weeklyFrequency must still apply');
  assert(
    after?.isActive === false,
    'omitting optional isActive must preserve an existing inactive plan instead of silently reactivating it'
  );

  console.log('Modify-training-plan inactive-state preservation regression passed');
}

runModifyTrainingPlanStatePreservationRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
