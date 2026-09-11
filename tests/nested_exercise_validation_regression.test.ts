/**
 * Phase 0.75 - Part 2C: Nested Workout Exercises Validation Regression Suite
 * 
 * Verifies deep validation and prototype sanitization of workout.exercises hierarchy:
 * TEST 1: Valid workout.exercises structure succeeds.
 * TEST 2: Non-array workout.exercises fails.
 * TEST 3: Malformed nested exercise fails.
 * TEST 4: Malformed nested sets fail.
 * TEST 5: Negative weight fails.
 * TEST 6: Non-finite weight fails.
 * TEST 7: Invalid reps fail.
 * TEST 8: Invalid RIR/RPE fails.
 * TEST 9: Unexpected nested properties are not persisted.
 * TEST 10: Prototype-style keys (__proto__, constructor, prototype) cannot inject arbitrary state.
 * TEST 11: Existing valid legacy workout data remains valid.
 */

import { validateCompleteWorkout, validateWorkoutExercises } from '../src/lib/validation';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function getValidBaseWorkout() {
  return {
    id: 'w_test_valid_001',
    userId: 'u_test_user_001',
    title: 'Comprehensive Hypertrophy Session',
    scheduledDate: '2026-09-10',
    status: 'PLANNED',
    sets: [],
    version: 1
  };
}

async function runNestedValidationTests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING PHASE 0.75 NESTED EXERCISES VALIDATION SUITE 🛡️');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST 1: Valid workout.exercises structure succeeds
  // -------------------------------------------------------------
  console.log('--- TEST 1: Valid workout.exercises structure succeeds ---');
  const validWorkout = {
    ...getValidBaseWorkout(),
    exercises: [
      {
        id: 'ex_1',
        exerciseId: 'barbell_bench_press',
        name: 'Barbell Bench Press',
        category: 'Chest',
        notes: 'Paused at bottom',
        sets: [
          {
            id: 's_1_1',
            weight: 100,
            reps: 8,
            targetWeight: 100,
            targetReps: 8,
            completed: true,
            rir: 2,
            rpe: 8,
            setType: 'normal',
            notes: 'Felt clean'
          },
          {
            id: 's_1_2',
            weight: 105,
            reps: 6,
            completed: false,
            setType: 'W'
          }
        ]
      }
    ]
  };

  const validated1 = validateCompleteWorkout(validWorkout);
  assert(Array.isArray(validated1.exercises), 'exercises must be an array');
  assert(validated1.exercises?.length === 1, 'exercises array must have length 1');
  assert(validated1.exercises?.[0].exerciseId === 'barbell_bench_press', 'exerciseId must match');
  assert(validated1.exercises?.[0].sets.length === 2, 'sets array must have length 2');
  assert(validated1.exercises?.[0].sets[0].weight === 100, 'set 1 weight must be 100');
  assert(validated1.exercises?.[0].sets[0].completed === true, 'set 1 completed must be true');
  console.log('✔ Valid nested exercises and sets accepted cleanly.\n');

  // -------------------------------------------------------------
  // TEST 2: Non-array workout.exercises fails
  // -------------------------------------------------------------
  console.log('--- TEST 2: Non-array workout.exercises fails ---');
  const invalidTypeExercises = [
    { ...getValidBaseWorkout(), exercises: "not-an-array" },
    { ...getValidBaseWorkout(), exercises: 12345 },
    { ...getValidBaseWorkout(), exercises: { 0: { exerciseId: 'bench' } } },
    { ...getValidBaseWorkout(), exercises: true }
  ];

  for (const bad of invalidTypeExercises) {
    let failed = false;
    try {
      validateCompleteWorkout(bad);
    } catch (err: any) {
      if (err.message.includes('Workout exercises must be an array')) {
        failed = true;
      }
    }
    assert(failed, `Non-array exercises (${typeof bad.exercises}) must be rejected`);
  }
  console.log('✔ Non-array workout.exercises rejected safely.\n');

  // -------------------------------------------------------------
  // TEST 3: Malformed nested exercise fails
  // -------------------------------------------------------------
  console.log('--- TEST 3: Malformed nested exercise fails ---');
  const malformedExercises = [
    // Null element
    [{ ...getValidBaseWorkout(), exercises: [null] }, 'expected an object'],
    // Non-object element
    [{ ...getValidBaseWorkout(), exercises: ['bench_press_string'] }, 'expected an object'],
    // Missing exerciseId
    [{ ...getValidBaseWorkout(), exercises: [{ name: 'Bench Press', sets: [] }] }, 'exerciseId is required'],
    // Blank exerciseId
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: '   ', sets: [] }] }, 'exerciseId is required'],
    // Sets not an array
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: 'not-array' }] }, 'sets must be an array']
  ];

  for (const [badWorkout, expectedSubstr] of malformedExercises) {
    let rejected = false;
    try {
      validateCompleteWorkout(badWorkout);
    } catch (err: any) {
      if (err.message.includes(expectedSubstr as string)) {
        rejected = true;
      }
    }
    assert(rejected, `Malformed exercise must be rejected with message containing "${expectedSubstr}"`);
  }
  console.log('✔ Malformed nested exercise objects rejected.\n');

  // -------------------------------------------------------------
  // TEST 4: Malformed nested sets fail
  // -------------------------------------------------------------
  console.log('--- TEST 4: Malformed nested sets fail ---');
  const malformedSets = [
    // Set is null
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [null] }] }, 'expected an object'],
    // Set is string
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: ['set1'] }] }, 'expected an object'],
    // Completed is not a boolean (e.g. string 'true')
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: 'true' }] }] }, 'completed must be a boolean'],
    // Completed is a number
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: 1 }] }] }, 'completed must be a boolean'],
    // Invalid setType
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: true, setType: 'INVALID_TYPE' }] }] }, 'setType must be one of']
  ];

  for (const [badWorkout, expectedSubstr] of malformedSets) {
    let rejected = false;
    try {
      validateCompleteWorkout(badWorkout);
    } catch (err: any) {
      if (err.message.includes(expectedSubstr as string)) {
        rejected = true;
      }
    }
    assert(rejected, `Malformed set must be rejected with message containing "${expectedSubstr}"`);
  }
  console.log('✔ Malformed nested set elements rejected.\n');

  // -------------------------------------------------------------
  // TEST 5: Negative weight fails
  // -------------------------------------------------------------
  console.log('--- TEST 5: Negative weight fails ---');
  const negativeWeightWorkouts = [
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: -5, reps: 10, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, targetWeight: -10, reps: 10, completed: true }] }] }
  ];

  for (const bad of negativeWeightWorkouts) {
    let rejected = false;
    try {
      validateCompleteWorkout(bad);
    } catch (err: any) {
      if (err.message.toLowerCase().includes('weight must be a finite number between 0 and 1000kg')) {
        rejected = true;
      }
    }
    assert(rejected, 'Negative weight in nested set must be rejected');
  }
  console.log('✔ Negative weights rejected.\n');

  // -------------------------------------------------------------
  // TEST 6: Non-finite weight fails
  // -------------------------------------------------------------
  console.log('--- TEST 6: Non-finite weight fails ---');
  const nonFiniteWeightWorkouts = [
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: NaN, reps: 10, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: Infinity, reps: 10, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: -Infinity, reps: 10, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: '100' as any, reps: 10, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 1001, reps: 10, completed: true }] }] } // exceeds 1000kg limit
  ];

  for (const bad of nonFiniteWeightWorkouts) {
    let rejected = false;
    try {
      validateCompleteWorkout(bad);
    } catch (err: any) {
      if (err.message.includes('weight must be a finite number between 0 and 1000kg')) {
        rejected = true;
      }
    }
    assert(rejected, 'Non-finite or out-of-bounds weight must be rejected');
  }
  console.log('✔ Non-finite and out-of-bounds weights rejected.\n');

  // -------------------------------------------------------------
  // TEST 7: Invalid reps fail
  // -------------------------------------------------------------
  console.log('--- TEST 7: Invalid reps fail ---');
  const invalidRepsWorkouts = [
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 0, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: -5, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 3.5, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 201, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: NaN, completed: true }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: '8' as any, completed: true }] }] }
  ];

  for (const bad of invalidRepsWorkouts) {
    let rejected = false;
    try {
      validateCompleteWorkout(bad);
    } catch (err: any) {
      if (err.message.includes('reps must be an integer between 1 and 200')) {
        rejected = true;
      }
    }
    assert(rejected, 'Invalid reps must be rejected');
  }
  console.log('✔ Invalid reps rejected.\n');

  // -------------------------------------------------------------
  // TEST 8: Invalid RIR/RPE fails
  // -------------------------------------------------------------
  console.log('--- TEST 8: Invalid RIR/RPE fails ---');
  const invalidRirRpeWorkouts = [
    // RIR > 10
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: true, rir: 11 }] }] }, 'RIR must be a finite number between 0 and 10'],
    // RIR < 0
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: true, rir: -1 }] }] }, 'RIR must be a finite number between 0 and 10'],
    // RPE < 1
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: true, rpe: 0 }] }] }, 'RPE must be a finite number between 1 and 10'],
    // RPE > 10
    [{ ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10, completed: true, rpe: 11 }] }] }, 'RPE must be a finite number between 1 and 10']
  ];

  for (const [badWorkout, expectedSubstr] of invalidRirRpeWorkouts) {
    let rejected = false;
    try {
      validateCompleteWorkout(badWorkout);
    } catch (err: any) {
      if (err.message.includes(expectedSubstr as string)) {
        rejected = true;
      }
    }
    assert(rejected, `Invalid RIR/RPE must be rejected with message containing "${expectedSubstr}"`);
  }
  console.log('✔ Invalid RIR and RPE bounds rejected.\n');

  // -------------------------------------------------------------
  // TEST 9: Unexpected nested properties are not persisted
  // -------------------------------------------------------------
  console.log('--- TEST 9: Unexpected nested properties are not persisted ---');
  const workoutWithExtraProps = {
    ...getValidBaseWorkout(),
    exercises: [
      {
        exerciseId: 'squat',
        name: 'Back Squat',
        unexpectedExerciseField: 'malicious_extra_exercise_data',
        injectedAdminPrivilege: true,
        sets: [
          {
            weight: 120,
            reps: 5,
            completed: true,
            unexpectedSetField: 'malicious_extra_set_data',
            bypassSecurity: true
          }
        ]
      }
    ]
  };

  const sanitized = validateCompleteWorkout(workoutWithExtraProps);
  const exerciseResult = sanitized.exercises?.[0] as any;
  const setResult = exerciseResult?.sets?.[0] as any;

  assert(exerciseResult.unexpectedExerciseField === undefined, 'unexpectedExerciseField must be dropped');
  assert(exerciseResult.injectedAdminPrivilege === undefined, 'injectedAdminPrivilege must be dropped');
  assert(setResult.unexpectedSetField === undefined, 'unexpectedSetField must be dropped');
  assert(setResult.bypassSecurity === undefined, 'bypassSecurity must be dropped');
  assert(setResult.weight === 120, 'Permitted set weight must be preserved');
  assert(setResult.reps === 5, 'Permitted set reps must be preserved');
  console.log('✔ Unexpected nested fields stripped cleanly and not persisted.\n');

  // -------------------------------------------------------------
  // TEST 10: Prototype-style keys cannot inject arbitrary state
  // -------------------------------------------------------------
  console.log('--- TEST 10: Prototype-style keys (__proto__, constructor, prototype) cannot inject arbitrary state ---');
  const prototypePayloads = [
    { ...getValidBaseWorkout(), exercises: [JSON.parse('{"exerciseId":"bench","sets":[],"__proto__":{"polluted":true}}')] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', constructor: { name: 'exploit' }, sets: [] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', prototype: { isAdmin: true }, sets: [] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [JSON.parse('{"weight":100,"reps":5,"completed":true,"__proto__":{"polluted":true}}')] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, completed: true, constructor: 'foo' }] }] },
    { ...getValidBaseWorkout(), exercises: [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5, completed: true, prototype: 'bar' }] }] }
  ];

  for (const bad of prototypePayloads) {
    let rejected = false;
    try {
      validateCompleteWorkout(bad);
    } catch (err: any) {
      if (err.message.includes('forbidden prototype key')) {
        rejected = true;
      }
    }
    assert(rejected, 'Prototype injection attempts must be blocked with "forbidden prototype key"');
  }
  console.log('✔ Prototype-style keys strictly blocked.\n');

  // -------------------------------------------------------------
  // TEST 11: Existing valid legacy workout data remains valid
  // -------------------------------------------------------------
  console.log('--- TEST 11: Existing valid legacy workout data remains valid ---');
  // Legacy workout without exercises (uses flat sets)
  const legacyFlatWorkout = {
    ...getValidBaseWorkout(),
    sets: [
      { id: 's1', exercise: 'Deadlift', weight: 140, reps: 5, rir: 2, completed: true, setType: 'normal' }
    ]
  };
  const validatedLegacy = validateCompleteWorkout(legacyFlatWorkout);
  assert(validatedLegacy.sets.length === 1, 'Legacy sets must be preserved');
  assert(validatedLegacy.sets[0].exercise === 'Deadlift', 'Legacy exercise name preserved');
  assert(validatedLegacy.sets[0].weight === 140, 'Legacy weight preserved');

  // Legacy workout with both flat sets and exercises
  const legacyCombinedWorkout = {
    ...getValidBaseWorkout(),
    sets: [
      { id: 's1', exercise: 'Deadlift', weight: 140, reps: 5, completed: true }
    ],
    exercises: [
      {
        exerciseId: 'deadlift',
        sets: [
          { weight: 140, reps: 5, completed: true }
        ]
      }
    ]
  };
  const validatedCombined = validateCompleteWorkout(legacyCombinedWorkout);
  assert(validatedCombined.sets.length === 1, 'Flat sets preserved');
  assert(validatedCombined.exercises?.length === 1, 'Nested exercises preserved');
  console.log('✔ Legacy workout data structures remain completely functional.\n');

  console.log('================================================================');
  console.log('🎉 ALL 11 NESTED EXERCISES VALIDATION TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runNestedValidationTests().catch((err) => {
  console.error('❌ NESTED VALIDATION TEST FAILED:', err);
  process.exit(1);
});
