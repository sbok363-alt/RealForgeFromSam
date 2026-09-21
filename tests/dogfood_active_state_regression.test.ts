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


let recursiveWarnings = 0;
let recursiveStorage: ReturnType<typeof createSafeStateStorage>;
recursiveStorage = createSafeStateStorage({
  getItem: () => null,
  setItem: () => { throw new Error('quota'); },
  removeItem: () => undefined,
}, () => {
  recursiveWarnings++;
  if (recursiveWarnings < 5) {
    recursiveStorage.setItem('forge-active-workout-v2', '{}');
  }
});
recursiveStorage.setItem('forge-active-workout-v2', '{}');
if (recursiveWarnings !== 1) {
  throw new Error(`storage failure callback must not recursively re-report the same failure, got ${recursiveWarnings}`);
}

let failWrites = true;
let recoverySignals = 0;
const recoveringStorage = (createSafeStateStorage as any)({
  getItem: () => null,
  setItem: () => {
    if (failWrites) throw new Error('temporary quota');
  },
  removeItem: () => undefined,
}, () => {}, () => { recoverySignals++; });
recoveringStorage.setItem('forge-active-workout-v2', '{}');
failWrites = false;
recoveringStorage.setItem('forge-active-workout-v2', '{}');
if (recoverySignals !== 1) {
  throw new Error(`storage recovery must emit exactly one healthy signal, got ${recoverySignals}`);
}
