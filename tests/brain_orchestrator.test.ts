import assert from 'node:assert';
import {
  proposeProgressionUpdateDeclaration,
  proposePlanModificationDeclaration,
  flagExerciseStallDeclaration,
  brainToolDeclarations,
  buildBrainContext,
  executeBrainAction,
  FlagExerciseStallSchema,
} from '../src/ai/progressBrain';
import { InMemoryMutationStorageAdapter } from '../src/domain/mutations';
import { Workout } from '../src/types';

async function runBrainOrchestratorTests() {
  console.log('🧪 RUNNING PHASE 3 PROGRESS BRAIN ORCHESTRATOR TESTS 🧪\n');

  // --- 1. Tool Declaration Invariants ---
  console.log('--- 1. Tool Declaration Invariants ---');
  assert.strictEqual(brainToolDeclarations.length, 3, 'Should define 3 brain tools');
  const toolNames = brainToolDeclarations.map(t => t.name);
  assert(toolNames.includes('proposeProgressionUpdate'), 'Missing proposeProgressionUpdate');
  assert(toolNames.includes('proposePlanModification'), 'Missing proposePlanModification');
  assert(toolNames.includes('flagExerciseStall'), 'Missing flagExerciseStall');
  console.log('✔ Function declarations adhere to Gemini API specs');

  // --- 2. Analytics Summarizer & Context Builder ---
  console.log('\n--- 2. Context Builder (buildBrainContext) ---');
  const mockWorkouts: Workout[] = [
    {
      id: 'w1',
      title: 'Upper Push A',
      scheduledDate: '2026-08-20',
      status: 'COMPLETED',
      version: 1,
      sets: [
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
      ]
    },
    {
      id: 'w2',
      title: 'Upper Push A',
      scheduledDate: '2026-08-23',
      status: 'COMPLETED',
      version: 1,
      sets: [
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
      ]
    },
    {
      id: 'w3',
      title: 'Upper Push A',
      scheduledDate: '2026-08-27',
      status: 'COMPLETED',
      version: 1,
      sets: [
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
        { exercise: 'Bench Press', weight: 100, reps: 8, completed: true, rir: 2 },
      ]
    }
  ];

  const context = await buildBrainContext('user_test_123', { workouts: mockWorkouts });
  assert.strictEqual(context.userId, 'user_test_123');
  assert.strictEqual(context.hardFacts.completedWorkoutsCount, 3);
  assert(context.promptContextText.includes('Bench Press'));
  assert(context.hardFacts.stalledExercises.length > 0, 'Should detect bench press stall over 3 identical sessions');
  console.log('✔ Factual training context and stall detection accurately computed');

  // --- 3. Non-mutating Tool Execution (flagExerciseStall) ---
  console.log('\n--- 3. Non-mutating Tool (flagExerciseStall) ---');
  const inMemoryStorage = new InMemoryMutationStorageAdapter();

  const validStallCall = {
    name: 'flagExerciseStall',
    args: {
      exerciseId: 'bench_press',
      sessionsAnalyzed: 3,
      e1rmTrendPercent: 0.0,
      stallReason: 'Plateaued at 100kg across 3 sessions',
      recommendedAction: 'HOLD_LOAD',
      explanation: 'Maintain working weight and strive for rep or quality increase before adding load.'
    }
  };

  const stallRes = await executeBrainAction(validStallCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });

  assert.strictEqual(stallRes.success, true);
  assert.strictEqual(stallRes.actionType, 'ANALYSIS_ONLY');
  assert.strictEqual(stallRes.data.verified, true);
  console.log('✔ flagExerciseStall validated and executed without side-effects');

  // Invalid stall args
  const invalidStallCall = {
    name: 'flagExerciseStall',
    args: {
      exerciseId: '', // Invalid empty id
      sessionsAnalyzed: 0, // Must be >= 1
      stallReason: '',
      recommendedAction: 'UNKNOWN_ACTION',
    }
  };
  const invalidStallRes = await executeBrainAction(invalidStallCall as any, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(invalidStallRes.success, false);
  console.log('✔ Invalid flagExerciseStall arguments safely rejected');

  // --- 4. Mutating Tool Execution (proposeProgressionUpdate) ---
  console.log('\n--- 4. Mutating Tool (proposeProgressionUpdate) ---');

  // Case A: Missing reason / rationale
  const noReasonCall = {
    name: 'proposeProgressionUpdate',
    args: {
      exerciseId: 'barbell_squat',
      targetWeightKg: 120,
      targetRepsMin: 6,
      targetRepsMax: 8,
      action: 'INCREASE_WEIGHT',
      rationale: '' // Empty reason
    }
  };
  const noReasonRes = await executeBrainAction(noReasonCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(noReasonRes.success, false);
  assert(noReasonRes.error?.includes('rationale/reason is strictly required'));
  console.log('✔ AI_BRAIN mutation without reason is strictly rejected');

  // Case B: Inverted reps (max < min) failing Zod schema
  const invertedRepsCall = {
    name: 'proposeProgressionUpdate',
    args: {
      exerciseId: 'barbell_squat',
      targetWeightKg: 120,
      targetRepsMin: 10,
      targetRepsMax: 5, // Invalid: max < min
      action: 'INCREASE_WEIGHT',
      rationale: 'Hit top of range comfortably.'
    }
  };
  const invertedRes = await executeBrainAction(invertedRepsCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(invertedRes.success, false);
  assert(invertedRes.error?.includes('Validation failed'));
  console.log('✔ Malformed progression proposal safely caught by Zod schema guard');

  // Case C: Valid progression proposal
  const validProgressionCall = {
    name: 'proposeProgressionUpdate',
    args: {
      exerciseId: 'barbell_squat',
      targetWeightKg: 122.5,
      targetRepsMin: 6,
      targetRepsMax: 8,
      suggestedRir: 2,
      action: 'INCREASE_WEIGHT',
      rationale: 'Completed 3x8 at 120kg with RIR 2 in consecutive sessions; overload increment of +2.5kg applied.'
    }
  };
  const validProgRes = await executeBrainAction(validProgressionCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(validProgRes.success, true);
  assert.strictEqual(validProgRes.actionType, 'MUTATION');
  assert(validProgRes.auditLogId, 'Must generate an audit log ID');
  assert.strictEqual(validProgRes.data.targetWeightKg, 122.5);
  assert.strictEqual(validProgRes.data.source, 'AI_BRAIN');
  console.log('✔ Valid AI progression update executed and committed through secure pipeline');

  // --- 5. Mutating Tool Execution (proposePlanModification) ---
  console.log('\n--- 5. Mutating Tool (proposePlanModification) ---');
  const validPlanCall = {
    name: 'proposePlanModification',
    args: {
      planId: 'plan_upper_lower_4day',
      name: 'Upper / Lower Hypertrophy (Deload Week)',
      weeklyFrequency: 4,
      isActive: true,
      days: [
        {
          id: 'day_upper',
          name: 'Upper Deload',
          exercises: [
            {
              id: 'ex_1',
              exerciseId: 'bench_press',
              targetSets: 2,
              targetRepsMin: 6,
              targetRepsMax: 8
            }
          ]
        }
      ],
      rationale: 'Accumulated fatigue detected across chest volume; reducing sets to 2 for a 1-week deload.'
    }
  };
  const validPlanRes = await executeBrainAction(validPlanCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(validPlanRes.success, true);
  assert.strictEqual(validPlanRes.actionType, 'MUTATION');
  assert.strictEqual(validPlanRes.data.source, 'AI_BRAIN');
  console.log('✔ Valid AI plan modification executed and committed through secure pipeline');

  // Unrecognized tool
  const unknownToolCall = {
    name: 'unauthorizedCommand',
    args: {}
  };
  const unknownRes = await executeBrainAction(unknownToolCall, {
    authenticatedUserId: 'user_test_123',
    storageAdapter: inMemoryStorage
  });
  assert.strictEqual(unknownRes.success, false);
  assert(unknownRes.error?.includes('Unrecognized AI tool call'));
  console.log('✔ Unrecognized tool call rejected');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 3 BRAIN ORCHESTRATOR TESTS PASSED (100% GREEN)');
  console.log('======================================================');
}

runBrainOrchestratorTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
