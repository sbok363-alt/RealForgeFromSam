import { executeBrainAction } from '../src/ai/progressBrain';
import {
  InMemoryMutationStorageAdapter,
  MutationStorageAdapter,
  SecureAuditLogEntry,
} from '../src/domain/mutations';
import { IdempotencyRecord } from '../src/lib/idempotency-guard';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/**
 * The outer adapter represents the caller-owned adapter passed into executeSecureMutation.
 * Its runTransaction() supplies a distinct transaction-scoped adapter. Any entity write
 * performed directly on the outer adapter is a transaction escape and must fail this test.
 */
class TransactionBoundaryProbe implements MutationStorageAdapter {
  readonly tx = new InMemoryMutationStorageAdapter();
  outerCommitCalls = 0;

  async findExistingEntity(entityType: string, entityId: string) {
    return this.tx.findExistingEntity(entityType, entityId);
  }

  async findIdempotencyRecord(key: string) {
    return this.tx.findIdempotencyRecord(key);
  }

  async recordIdempotency(record: IdempotencyRecord & { auditLogId?: string }) {
    return this.tx.recordIdempotency(record);
  }

  async recordAuditLog(entry: SecureAuditLogEntry) {
    return this.tx.recordAuditLog(entry);
  }

  async commitMutation(_entityType: string, _entityId: string, _data: Record<string, any>) {
    this.outerCommitCalls += 1;
    throw new Error('OUTER_ADAPTER_WRITE_FORBIDDEN');
  }

  async runTransaction<R>(fn: (txAdapter: MutationStorageAdapter) => Promise<R>): Promise<R> {
    return fn(this.tx);
  }
}

async function runBrainTransactionStorageRegression() {
  const userId = 'user_tx';
  const storage = new TransactionBoundaryProbe();

  storage.tx.seedEntity('plans', 'plan_tx', {
    id: 'plan_tx',
    userId,
    name: 'Before',
    weeklyFrequency: 3,
    isActive: true,
    days: [
      {
        id: 'day_before',
        name: 'Before Day',
        exercises: [
          {
            id: 'pe_before',
            exerciseId: 'bench_press',
            targetSets: 3,
            targetRepsMin: 6,
            targetRepsMax: 8,
          },
        ],
      },
    ],
  });

  const planResult = await executeBrainAction(
    {
      name: 'proposePlanModification',
      args: {
        planId: 'plan_tx',
        name: 'After',
        weeklyFrequency: 4,
        isActive: true,
        days: [
          {
            id: 'day_after',
            name: 'After Day',
            exercises: [
              {
                id: 'pe_after',
                exerciseId: 'bench_press',
                targetSets: 2,
                targetRepsMin: 8,
                targetRepsMax: 10,
              },
            ],
          },
        ],
        rationale: 'Verified owner-requested plan adjustment.',
      },
    },
    {
      authenticatedUserId: userId,
      storageAdapter: storage,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    }
  );

  assert(planResult.success === true, `plan mutation must succeed inside transaction: ${planResult.error}`);
  assert(storage.outerCommitCalls === 0, 'plan mutation must never write through the outer adapter');

  const updatedPlan = await storage.tx.findExistingEntity('plans', 'plan_tx');
  assert(updatedPlan?.name === 'After', 'transaction-scoped plan write must persist');
  assert(updatedPlan?.userId === userId, 'plan ownership must remain unchanged');

  const targetId = `target_${userId}_bench_press`;
  storage.tx.seedEntity('targets_1rm', targetId, {
    id: targetId,
    userId,
    exerciseId: 'bench_press',
    targetWeightKg: 80,
    targetRepsMin: 6,
    targetRepsMax: 8,
    action: 'MAINTAIN',
    rationale: 'Before',
  });

  const progressionResult = await executeBrainAction(
    {
      name: 'proposeProgressionUpdate',
      args: {
        exerciseId: 'bench_press',
        targetWeightKg: 82.5,
        targetRepsMin: 6,
        targetRepsMax: 8,
        suggestedRir: 2,
        action: 'INCREASE_WEIGHT',
        rationale: 'Completed the top of the rep range at target RIR.',
      },
    },
    {
      authenticatedUserId: userId,
      storageAdapter: storage,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    }
  );

  assert(
    progressionResult.success === true,
    `progression mutation must succeed inside transaction: ${progressionResult.error}`
  );
  assert(storage.outerCommitCalls === 0, 'progression mutation must never write through the outer adapter');

  const updatedTarget = await storage.tx.findExistingEntity('targets_1rm', targetId);
  assert(updatedTarget?.targetWeightKg === 82.5, 'transaction-scoped target write must persist');
  assert(updatedTarget?.userId === userId, 'target ownership must remain unchanged');

  const auditLogs = storage.tx.getAuditLogs();
  const planAudit = auditLogs.find((entry) => entry.targetEntityId === 'plan_tx');
  const targetAudit = auditLogs.find((entry) => entry.targetEntityId === targetId);

  assert(planAudit?.beforeState?.name === 'Before', 'plan audit must capture transactional beforeState');
  assert(
    targetAudit?.beforeState?.targetWeightKg === 80,
    'target audit must resolve beforeState from the physical targets_1rm collection'
  );

  console.log('Brain transaction-scoped mutation regression passed');
}

runBrainTransactionStorageRegression().catch((error) => {
  console.error(error);
  process.exit(1);
});
