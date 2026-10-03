/**
 * B1 P0 REGRESSION: MODIFY_TRAINING_PLAN cross-tenant ownership takeover.
 *
 * Original defect (B1):
 *   - Ownership validation resolved the target through the audit-facing entity type
 *     "TRAINING_PLAN" (i.e. TRAINING_PLAN/{planId}).
 *   - Execution wrote to the real "plans" collection (plans/{planId}).
 *   - Because those two locations differ, the ownership probe returned null for a plan that
 *     did exist, the guard was skipped, and the attacker overwrote the victim's plan with
 *     `userId = <attacker>` (ownership takeover).
 *
 * This suite proves the exploit is closed on BOTH authoritative call sites:
 *   1. server.ts -> handleMutationsExecute (MODIFY_TRAINING_PLAN)
 *   2. src/ai/progressBrain.ts -> executeBrainAction('proposePlanModification')
 */

import { handleMutationsExecute, setAdminAuthForTesting } from '../server';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';
import { executeBrainAction } from '../src/ai/progressBrain';

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

/** The canonical collection that actually stores training plans. */
const PLANS = 'plans';

function victimPlan(userId: string, planId: string, name: string) {
  return {
    id: planId,
    userId,
    name,
    weeklyFrequency: 4,
    isActive: true,
    days: [
      {
        id: 'day_upper',
        name: 'Upper',
        exercises: [
          { id: 'pe_bench', exerciseId: 'ex_bench', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 }
        ]
      }
    ]
  };
}

function attackerDays() {
  return [
    {
      id: 'day_hijack',
      name: 'Attacker Day',
      exercises: [
        { id: 'pe_bad', exerciseId: 'ex_bad', targetSets: 1, targetRepsMin: 1, targetRepsMax: 1 }
      ]
    }
  ];
}

async function runModifyTrainingPlanAuthorizationRegressionTests() {
  console.log('================================================================');
  console.log('RUNNING B1 MODIFY_TRAINING_PLAN AUTHORIZATION REGRESSION SUITE');
  console.log('================================================================\n');

  setAdminAuthForTesting({
    verifyIdToken: async (token: string) => {
      if (token === 'token_user_a') return { uid: 'user_A' };
      if (token === 'token_user_b') return { uid: 'user_B' };
      const err: any = new Error('Invalid or expired Firebase ID token');
      err.status = 401;
      throw err;
    }
  });

  // ---------------------------------------------------------------------
  // TEST 1 (B1 exploit, server path): user_A cannot modify user_B's plan
  // ---------------------------------------------------------------------
  console.log("--- TEST 1: user_A cannot modify user_B's plan (server path) ---");
  {
    const storage = new InMemoryMutationStorageAdapter();
    const original = victimPlan('user_B', 'plan_victim_1', 'User B Hypertrophy');
    storage.seedEntity(PLANS, 'plan_victim_1', JSON.parse(JSON.stringify(original)));

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'MODIFY_TRAINING_PLAN',
        envelope: {
          idempotencyKey: 'a1111111-1111-4111-8111-111111111111',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            planId: 'plan_victim_1',
            name: 'HIJACKED BY ATTACKER',
            weeklyFrequency: 7,
            days: attackerDays()
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.body.success === false, 'Exploit must be rejected: expected success=false');
    assert(
      res.statusCode === 403 || res.statusCode === 404,
      `Expected HTTP 403/404 for cross-tenant plan write, got ${res.statusCode}`
    );
    assert(!JSON.stringify(res.body).includes('HIJACKED'), 'Attacker payload must not be echoed back');

    // Victim plan must be completely untouched: same owner, same contents.
    const after = await storage.findExistingEntity(PLANS, 'plan_victim_1');
    assert(after !== null, 'Victim plan must still exist');
    assert(after.userId === 'user_B', `Victim plan ownership must remain user_B, got "${after.userId}"`);
    assert(after.name === 'User B Hypertrophy', `Victim plan name must be unchanged, got "${after.name}"`);
    assert(after.weeklyFrequency === 4, 'Victim plan weeklyFrequency must be unchanged');
    assert(after.days[0].name === 'Upper', 'Victim plan days must be unchanged');
    assert(after.days[0].exercises[0].exerciseId === 'ex_bench', 'Victim plan exercises must be unchanged');

    // A rejected write must not leave successful audit or idempotency state behind.
    const auditLogs = storage.getAuditLogs().filter((a: any) => a.targetEntityId === 'plan_victim_1');
    assert(auditLogs.length === 0, 'Rejected request must not create an audit log entry');
    const idem = storage.getIdempotencyRecords().filter((r: any) => r.mutationId === 'a1111111-1111-4111-8111-111111111111');
    assert(idem.length === 0, 'Rejected request must not record idempotency state');

    console.log('Exploit blocked. Victim plan ownership and contents unchanged.\n');
  }

  // ---------------------------------------------------------------------
  // TEST 2 (B1 exploit, AI brain path): attacker brain cannot modify user_B's plan
  // ---------------------------------------------------------------------
  console.log("--- TEST 2: attacker brain cannot modify user_B's plan (brain path) ---");
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity(PLANS, 'plan_victim_2', victimPlan('user_B', 'plan_victim_2', 'User B Cut'));

    const result = await executeBrainAction(
      {
        name: 'proposePlanModification',
        args: {
          planId: 'plan_victim_2',
          name: 'HIJACKED BY BRAIN',
          weeklyFrequency: 7,
          days: attackerDays(),
          rationale: 'Cross-tenant probe'
        }
      },
      { authenticatedUserId: 'user_A', storageAdapter: storage, idempotencyKey: 'b1111111-1111-4111-8111-111111111111' }
    );

    assert(result.success === false, 'Brain path exploit must be rejected');
    assert(
      typeof result.error === 'string' && /Authorization failed|does not own/i.test(result.error),
      `Expected an authorization error from brain path, got "${result.error}"`
    );

    const after = await storage.findExistingEntity(PLANS, 'plan_victim_2');
    assert(after.userId === 'user_B', 'Victim plan ownership must remain user_B');
    assert(after.name === 'User B Cut', 'Victim plan name must be unchanged');

    const idem = storage.getIdempotencyRecords().filter((r: any) => r.mutationId === 'b1111111-1111-4111-8111-111111111111');
    assert(idem.length === 0, 'Rejected brain request must not record idempotency state');

    console.log('Brain path exploit blocked. Victim plan unchanged.\n');
  }

  // ---------------------------------------------------------------------
  // TEST 3: Legitimate owner CAN still modify their own plan (server path)
  // ---------------------------------------------------------------------
  console.log("--- TEST 3: user_B can still modify their own plan (server path) ---");
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity(PLANS, 'plan_owner_1', victimPlan('user_B', 'plan_owner_1', 'User B Base'));

    const req = {
      headers: { authorization: 'Bearer token_user_b' },
      body: {
        mutationType: 'MODIFY_TRAINING_PLAN',
        envelope: {
          idempotencyKey: 'c1111111-1111-4111-8111-111111111111',
          userId: 'user_B',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: {
            planId: 'plan_owner_1',
            name: 'User B Updated',
            weeklyFrequency: 5,
            days: attackerDays()
          }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    assert(res.statusCode === 200, `Owner must still be able to modify, got ${res.statusCode}`);
    assert(res.body.success === true, 'Owner modification must succeed');

    const after = await storage.findExistingEntity(PLANS, 'plan_owner_1');
    assert(after.name === 'User B Updated', 'Owner plan name must be updated');
    assert(after.userId === 'user_B', 'Owner plan must remain owned by user_B');
    assert(after.weeklyFrequency === 5, 'Owner plan weeklyFrequency must be updated');

    const auditLogs = storage.getAuditLogs().filter((a: any) => a.targetEntityId === 'plan_owner_1');
    assert(auditLogs.length === 1, 'Successful owner modification must create exactly one audit entry');
    assert(auditLogs[0].userId === 'user_B', 'Audit entry must be attributed to the owner');

    console.log('Owner capability preserved with correct audit attribution.\n');
  }

  // ---------------------------------------------------------------------
  // TEST 4: Legitimate owner CAN still modify via the AI brain path
  // ---------------------------------------------------------------------
  console.log('--- TEST 4: user_B can still modify their own plan (brain path) ---');
  {
    const storage = new InMemoryMutationStorageAdapter();
    storage.seedEntity(PLANS, 'plan_owner_2', victimPlan('user_B', 'plan_owner_2', 'User B Brain Plan'));

    const result = await executeBrainAction(
      {
        name: 'proposePlanModification',
        args: {
          planId: 'plan_owner_2',
          name: 'User B Brain Updated',
          weeklyFrequency: 3,
          days: attackerDays(),
          rationale: 'Owner-initiated progression adjustment'
        }
      },
      { authenticatedUserId: 'user_B', storageAdapter: storage, idempotencyKey: 'd1111111-1111-4111-8111-111111111111' }
    );

    assert(result.success === true, `Owner brain modification must succeed, got "${result.error}"`);
    const after = await storage.findExistingEntity(PLANS, 'plan_owner_2');
    assert(after.name === 'User B Brain Updated', 'Owner plan must be updated by brain path');
    assert(after.userId === 'user_B', 'Owner plan must remain owned by user_B');

    console.log('Owner brain capability preserved.\n');
  }

  // ---------------------------------------------------------------------
  // TEST 5: Unknown plan id must not be silently created/overwritten
  // ---------------------------------------------------------------------
  console.log('--- TEST 5: unknown planId must not be created by a cross-tenant write ---');
  {
    const storage = new InMemoryMutationStorageAdapter();

    const req = {
      headers: { authorization: 'Bearer token_user_a' },
      body: {
        mutationType: 'MODIFY_TRAINING_PLAN',
        envelope: {
          idempotencyKey: 'e1111111-1111-4111-8111-111111111111',
          userId: 'user_A',
          source: 'USER_INPUT',
          timestamp: new Date().toISOString(),
          payload: { planId: 'plan_does_not_exist', name: 'Ghost', days: attackerDays() }
        }
      },
      storageAdapter: storage
    };

    const res = createMockRes();
    await handleMutationsExecute(req, res);

    // Whichever policy applies (create or reject), a plan owned by someone else
    // must never exist. This asserts the security invariant, not the product policy.
    const after = await storage.findExistingEntity(PLANS, 'plan_does_not_exist');
    if (after) {
      assert(after.userId === 'user_A', 'A newly created plan must be owned by its creator');
    } else {
      assert(res.body.success === false, 'If no plan was created the request must report failure');
    }

    console.log('Unknown-plan behaviour is safe under both policies.\n');
  }

  console.log('================================================================');
  console.log('ALL B1 MODIFY_TRAINING_PLAN AUTHORIZATION REGRESSION TESTS PASSED');
  console.log('================================================================');
}

runModifyTrainingPlanAuthorizationRegressionTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});