import { createWorkoutSyncController, WorkoutSyncControllerDeps } from '../src/lib/workout-sync';
import { PendingWorkoutMutation, Workout } from '../src/types';

function assert(value: boolean, message: string) { if (!value) throw new Error(message); }

const workout: Workout = {
  id:'w1', userId:'u1', title:'Push', scheduledDate:'2026-09-21',
  status:'IN_PROGRESS', version:2, sets:[],
  exercises:[{id:'ex1',exerciseId:'bench',sets:[{id:'s1',weight:80,reps:8,completed:true}]}],
};

let state: any = {
  activeWorkout: workout, sessionRevision: 1, pendingMutation: null,
  syncConflict: null, startedAt: 1000,
};
const calls: PendingWorkoutMutation[] = [];
let loseFirst = true;

const deps: WorkoutSyncControllerDeps = {
  getState: () => state,
  mutate: async (op) => {
    calls.push(op);
    if (loseFirst) { loseFirst = false; throw new Error('network lost'); }
    return { ...state.activeWorkout, ...op.updates, version: op.baseVersion + 1 } as Workout;
  },
  createWorkout: async () => { throw new Error('unused'); },
  queuePendingMutation: (op) => { state = { ...state, pendingMutation: op }; },
  clearPendingMutation: () => { state = { ...state, pendingMutation: null }; },
  applyAuthoritativeWorkout: (w) => { state = { ...state, activeWorkout: w }; },
  setSyncConflict: (conflict) => { state = { ...state, syncConflict: conflict }; },
  setSyncError: (error) => { state = { ...state, syncError: error }; },
  completeWorkout: () => {},
  upsertAuthoritativeWorkoutCache: async () => {},
  now: () => 5000,
  uuid: (() => { let i=0; return () => `00000000-0000-4000-8000-${String(++i).padStart(12,'0')}`; })(),
};

const controller = createWorkoutSyncController(deps);
await controller.requestAutosync();
const pendingId = state.pendingMutation.mutationId;
await controller.retryPending();
assert(calls[1].mutationId === pendingId, 'retry must reuse pending mutation id');
assert(state.activeWorkout.version === 3, 'authoritative version must be applied');
assert(state.pendingMutation === null, 'successful replay clears pending operation');
