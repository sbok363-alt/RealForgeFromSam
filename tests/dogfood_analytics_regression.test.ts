import { calculatePhysiqueHypertrophyVolume } from '../src/lib/hypertrophy';
import { extractExerciseHistory } from '../src/lib/progression';
import { projectCompletedWorkingSets } from '../src/lib/workout-session';

const now = Date.now();
const workout: any = {
  id:'w1', title:'Push', scheduledDate:new Date(now).toISOString().slice(0,10),
  completedAt:now, status:'COMPLETED', version:4,
  exercises:[{id:'ex1',exerciseId:'bench_press',sets:[
    {id:'work',weight:80,reps:8,completed:true,setType:'N'},
    {id:'warm',weight:40,reps:10,completed:true,setType:'W'},
    {id:'typed',weight:85,reps:8,completed:false,setType:'N'},
    {id:'body',weight:0,reps:12,completed:true,setType:'N'},
  ]}],
  sets:[
    {id:'work',exercise:'bench_press',weight:80,reps:8,completed:true,setType:'N'},
    {id:'warm',exercise:'bench_press',weight:40,reps:10,completed:true,setType:'W'},
  ],
};
const canonical = projectCompletedWorkingSets(workout);
if (canonical.map(s=>s.id).join(',') !== 'work,body') throw new Error('canonical working sets wrong');

const audit = calculatePhysiqueHypertrophyVolume([workout], undefined, false);
if (audit.muscles.CHEST.week1Sets !== 2) throw new Error('hypertrophy must count canonical working sets once');

const history = extractExerciseHistory([workout], 'bench_press');
if (history.length !== 1 || history[0].sets.some(s => s.id === 'warm')) throw new Error('progression must exclude warmups');
