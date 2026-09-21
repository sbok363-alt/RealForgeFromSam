import { calculatePhysiqueHypertrophyVolume } from '../src/lib/hypertrophy';
import { extractExerciseHistory } from '../src/lib/progression';
import { projectCompletedWorkingSets } from '../src/lib/workout-session';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const now = Date.now();
const workout: any = {
  id: 'dogfood-analytics',
  title: 'Push',
  scheduledDate: new Date(now).toISOString().slice(0, 10),
  completedAt: now,
  status: 'COMPLETED',
  version: 4,
  exercises: [{
    id: 'ex-bench',
    exerciseId: 'bench_press',
    sets: [
      { id: 'work', weight: 80, reps: 8, completed: true, setType: 'N' },
      { id: 'warm', weight: 40, reps: 10, completed: true, setType: 'W' },
      { id: 'typed', weight: 85, reps: 8, completed: false, setType: 'N' },
      { id: 'body', weight: 0, reps: 12, completed: true, setType: 'N' },
    ],
  }],
  sets: [
    { id: 'work', exercise: 'bench_press', weight: 80, reps: 8, completed: true, setType: 'N' },
    { id: 'warm', exercise: 'bench_press', weight: 40, reps: 10, completed: true, setType: 'W' },
  ],
};

const canonical = projectCompletedWorkingSets(workout);
assert(canonical.map(s => s.id).join(',') === 'work,body',
  'canonical projection must keep only completed working sets once');

const audit = calculatePhysiqueHypertrophyVolume([workout], undefined, false);
assert(audit.muscles.CHEST.week1Sets === 2,
  'hypertrophy must count canonical working sets once, including zero-external-load completed sets');

const history = extractExerciseHistory([workout], 'bench_press');
assert(history.length === 1, 'progression should contain the completed bench session');
assert(!history[0].sets.some(s => s.id === 'warm'),
  'progression must exclude warmups from working-set history');
assert(!history[0].sets.some(s => s.id === 'typed'),
  'progression must exclude typed but incomplete sets');

console.log('✔ Dogfood analytics regression passed');
