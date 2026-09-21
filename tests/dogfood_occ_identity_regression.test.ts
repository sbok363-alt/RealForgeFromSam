import { rebuildExercisesPreservingIdentity } from '../src/lib/workout-session';

const rebuilt = rebuildExercisesPreservingIdentity(
  [
    { id:'s1', exercise:'Bench Press', weight:80, reps:8, completed:true },
    { id:'s2', exercise:'Bench Press', weight:80, reps:8, completed:true },
  ],
  [{ id:'existing-exercise-id', exerciseId:'barbell-bench-press', name:'Bench Press', sets:[] }]
);
if (rebuilt[0].id !== 'existing-exercise-id') throw new Error('existing exercise identity must survive rebuild');
if (rebuilt[0].sets.map(s => s.id).join(',') !== 's1,s2') throw new Error('set identity must survive rebuild');
