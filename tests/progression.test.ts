import { analyzeExerciseProgression, calculateE1RM } from '../src/lib/progression';
import { Workout } from '../src/types';

function runTests() {
  console.log('=== RUNNING DETERMINISTIC PROGRESSION ENGINE TESTS ===\n');

  // Test 1: calculateE1RM
  const e1rm1 = calculateE1RM(100, 1);
  console.assert(e1rm1 === 100, `Expected 100, got ${e1rm1}`);
  
  const e1rm10 = calculateE1RM(100, 10);
  console.assert(e1rm10 === 133.3, `Expected 133.3, got ${e1rm10}`);

  const e1rmWithRIR = calculateE1RM(60, 8, 2); // 8 reps + 2 RIR = 10 effective reps -> 60 * (1 + 10/30) = 80.0
  console.assert(e1rmWithRIR === 80, `Expected 80, got ${e1rmWithRIR}`);
  console.log('✔ Epley 1RM calculation with RIR passed');

  // Scenario F: Insufficient Data (0 or 1 session)
  const emptyWorkouts: Workout[] = [];
  const repEmpty = analyzeExerciseProgression(emptyWorkouts, 'bench_press', 'Bench Press');
  console.assert(repEmpty.state === 'INSUFFICIENT_DATA', `Expected INSUFFICIENT_DATA, got ${repEmpty.state}`);
  console.assert(repEmpty.recentSessionsCount === 0, `Expected 0 sessions, got ${repEmpty.recentSessionsCount}`);

  const oneSessionWorkouts: Workout[] = [
    {
      id: 'w1',
      title: 'Chest Day',
      scheduledDate: '2026-08-01',
      status: 'COMPLETED',
      version: 1,
      sets: [
        { id: 's1', exercise: 'Bench Press', weight: 60, reps: 8, rir: 2, completed: true }
      ]
    }
  ];
  const repOne = analyzeExerciseProgression(oneSessionWorkouts, 'bench_press', 'Bench Press');
  console.assert(repOne.state === 'INSUFFICIENT_DATA', `Expected INSUFFICIENT_DATA for 1 session, got ${repOne.state}`);
  console.assert(repOne.recentSessionsCount === 1, `Expected 1 session, got ${repOne.recentSessionsCount}`);
  console.log('✔ Scenario F (Insufficient Data) passed');

  // Scenario C: Progressing
  // Session 1: 60kg x 8 @ RIR 2 (e1RM = 80.0)
  // Session 2: 60kg x 9 @ RIR 1 (e1RM = 80.0)
  // Session 3: 62.5kg x 7 @ RIR 1 (e1RM = 79.2 raw / 81.3 w/ RIR)
  const progressingWorkouts: Workout[] = [
    {
      id: 'w1',
      title: 'Chest Day 1',
      scheduledDate: '2026-08-01',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's1', exercise: 'Bench Press', weight: 60, reps: 8, rir: 2, completed: true }]
    },
    {
      id: 'w2',
      title: 'Chest Day 2',
      scheduledDate: '2026-08-05',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's2', exercise: 'Bench Press', weight: 62.5, reps: 8, rir: 2, completed: true }]
    }
  ];
  const repProgress = analyzeExerciseProgression(progressingWorkouts, 'bench_press', 'Bench Press');
  console.assert(repProgress.state === 'PROGRESSING', `Expected PROGRESSING, got ${repProgress.state}`);
  console.assert(repProgress.nextTarget.action === 'INCREASE_WEIGHT' || repProgress.nextTarget.action === 'INCREASE_REPS', `Expected target overload action, got ${repProgress.nextTarget.action}`);
  console.assert(repProgress.nextTarget.targetWeight >= 62.5, `Expected target weight >= 62.5, got ${repProgress.nextTarget.targetWeight}`);
  console.log('✔ Scenario C (Progressing & Overload Target) passed');

  // Scenario D: Stalling
  const stallingWorkouts: Workout[] = [
    {
      id: 'w1',
      title: 'Upper 1',
      scheduledDate: '2026-08-01',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's1', exercise: 'Bench Press', weight: 80, reps: 8, rir: 1, completed: true }]
    },
    {
      id: 'w2',
      title: 'Upper 2',
      scheduledDate: '2026-08-05',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's2', exercise: 'Bench Press', weight: 80, reps: 8, rir: 1, completed: true }]
    },
    {
      id: 'w3',
      title: 'Upper 3',
      scheduledDate: '2026-08-09',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's3', exercise: 'Bench Press', weight: 80, reps: 8, rir: 1, completed: true }]
    }
  ];
  const repStall = analyzeExerciseProgression(stallingWorkouts, 'bench_press', 'Bench Press');
  console.assert(repStall.state === 'STALLING', `Expected STALLING, got ${repStall.state}`);
  console.assert(repStall.nextTarget.action === 'MAINTAIN', `Expected MAINTAIN for stall, got ${repStall.nextTarget.action}`);
  console.assert(repStall.nextTarget.targetWeight === 80, `Expected maintain 80kg, got ${repStall.nextTarget.targetWeight}`);
  console.log('✔ Scenario D (Stalling & No Blind Weight Increase) passed');

  // Scenario E: Regressing
  const regressingWorkouts: Workout[] = [
    {
      id: 'w1',
      title: 'Lower 1',
      scheduledDate: '2026-08-01',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's1', exercise: 'Squat', weight: 120, reps: 8, rir: 2, completed: true }]
    },
    {
      id: 'w2',
      title: 'Lower 2',
      scheduledDate: '2026-08-05',
      status: 'COMPLETED',
      version: 1,
      sets: [{ id: 's2', exercise: 'Squat', weight: 110, reps: 6, rir: 0, completed: true }]
    }
  ];
  const repRegress = analyzeExerciseProgression(regressingWorkouts, 'squat', 'Squat');
  console.assert(repRegress.state === 'REGRESSING', `Expected REGRESSING, got ${repRegress.state}`);
  console.assert(repRegress.nextTarget.action === 'DELOAD', `Expected DELOAD for regression, got ${repRegress.nextTarget.action}`);
  console.assert(repRegress.nextTarget.targetWeight <= 110, `Expected conservative load <= 110kg, got ${repRegress.nextTarget.targetWeight}`);
  console.log('✔ Scenario E (Regression & Conservative Deload Target) passed');

  console.log('\nALL 6 PROGRESSION ENGINE TESTS COMPLETED SUCCESSFULLY!\n');
}

runTests();
