import { reconcileAuthoritativeWorkout } from '../src/lib/workout-reconcile';
import { createSafeStateStorage } from '../src/lib/safe-storage';

const local: any = {
  id:'w1', title:'Push', scheduledDate:'2026-09-21', status:'IN_PROGRESS',
  version:2, sets:[], exercises:[{id:'ex1',exerciseId:'bench',sets:[{id:'s1',weight:82.5,reps:8,completed:true}]}],
};
const server: any = {
  ...local, version:3,
  exercises:[{id:'ex1',exerciseId:'bench',sets:[{id:'s1',weight:80,reps:8,completed:true}]}],
};
const reconciled = reconcileAuthoritativeWorkout(local, server, 5, 6);
if (reconciled.version !== 3) throw new Error('server version must advance');
if (reconciled.exercises?.[0].sets[0].weight !== 82.5) throw new Error('newer local edit must survive');

let warning = '';
const storage = createSafeStateStorage({
  getItem: () => null,
  setItem: () => { throw new Error('quota'); },
  removeItem: () => undefined,
}, (message) => { warning = message; });
storage.setItem('forge-active-workout-v2', '{}');
if (!warning) throw new Error('storage failure must surface');
