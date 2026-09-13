import assert from 'node:assert/strict';
import { analyzeExerciseProgression, calculateE1RM } from '../src/lib/progression';
import { Workout } from '../src/types';

function runAdversarialAudit() {
  console.log('🛡️ RUNNING V1 ADVERSARIAL AUDIT 🛡️\n');
  let failures = 0;

  try {
    // 1. NaN and Null Poisoning in E1RM
    console.log('Test 1: Data Poisoning in Progression Math');
    // @ts-ignore
    const badRirE1RM = calculateE1RM(100, 5, null); 
    // @ts-ignore
    const badWeightE1RM = calculateE1RM(NaN, 5, 2);
    // @ts-ignore
    const badRepsE1RM = calculateE1RM(100, undefined, 2);
    
    console.log(`badRirE1RM (null): ${badRirE1RM}`);
    console.log(`badWeightE1RM (NaN): ${badWeightE1RM}`);
    console.log(`badRepsE1RM (undefined): ${badRepsE1RM}`);
    
    if (isNaN(badRirE1RM)) {
      console.log('❌ VULNERABILITY: E1RM returns NaN when RIR is null.');
      failures++;
    }
  } catch (e) {
    failures++;
    console.log('Error in Test 1:', e);
  }

  try {
    // 2. Corrupt Workout History Payload
    console.log('\nTest 2: Malformed Workout History Injection');
    const corruptWorkouts: any[] = [
      {
        id: 'w_corrupt_1',
        status: 'COMPLETED',
        sets: [
          { exercise: 'squat', weight: "100", reps: "8" }, // strings instead of numbers
          { exercise: 'squat', weight: -50, reps: -10 }, // negatives
          { exercise: 'squat', weight: Infinity, reps: 5 } // Infinity
        ]
      },
      {
        id: 'w_corrupt_2',
        status: 'COMPLETED',
        sets: [
          { exercise: 'squat', weight: 120, reps: 5 }
        ]
      }
    ];

    const report = analyzeExerciseProgression(corruptWorkouts as Workout[], 'squat', 'Squat');
    console.log(`Progression State: ${report.state}`);
    console.log(`Calculated E1RM: ${report.currentE1RM}`);
    if (isNaN(report.currentE1RM) || report.currentE1RM === Infinity) {
      console.log('❌ VULNERABILITY: Progression engine vulnerable to type spoofing and Infinity.');
      failures++;
    }
  } catch (e) {
    failures++;
    console.log('Error in Test 2:', e);
  }

  console.log(`\nAudit Complete. Failures detected: ${failures}`);
  assert.equal(failures, 0, 'Adversarial regression failures must fail the test process');
}

runAdversarialAudit();
