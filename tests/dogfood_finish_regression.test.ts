import { createWorkoutSyncController, WorkoutSyncControllerDeps } from '../src/lib/workout-sync';
import { PendingWorkoutMutation, Workout } from '../src/types';

function assert(value: boolean, message: string) { if (!value) throw new Error(message); }

const base: Workout = {
  id:'w1', userId:'u1', title:'Push', scheduledDate:'2026-09-21',
  status:'IN_PROGRESS', version:2, sets:[],
  exercises:[{id:'ex1',exerciseId:'bench',sets:[{id:'s1',weight:80,reps:8,completed:true,setType:'N'}]}],
};
let state: any = { activeWorkout: base, sessionRevision:1, pendingMutation:null, syncConflict:null, startedAt:1000 };
const calls: PendingWorkoutMutation[] = [];
let server: Workout = base;
let lostAutosyncResponse = true;
let completions = 0;
let ids = 0;

const deps: WorkoutSyncControllerDeps = {
  getState: () => state,
  mutate: async (op) => {
    calls.push(op);
    if (op.kind === 'AUTOSYNC') {
      if (lostAutosyncResponse) {
        lostAutosyncResponse = false;
        server = { ...server, ...op.updates, version:3 };
        throw new Error('response lost');
      }
      return server; // idempotent replay of same autosync
    }
    assert(op.baseVersion === 3, 'finish must use authoritative autosync version');
    server = { ...server, ...op.updates, version:4 } as Workout;
    return server;
  },
  createCompletedWorkout: async () => { throw new Error('unused'); },
  queuePendingMutation: (op) => { state = { ...state, pendingMutation:op }; },
  clearPendingMutation: () => { state = { ...state, pendingMutation:null }; },
  applyAuthoritativeWorkout: (w) => { state = { ...state, activeWorkout:w }; },
  setSyncConflict: (v) => { state = { ...state, syncConflict:v }; },
  setSyncError: (v) => { state = { ...state, syncError:v }; },
  completeWorkout: () => { completions++; state = { ...state, activeWorkout:null }; },
  upsertAuthoritativeWorkoutCache: async () => {},
  now: () => 5000,
  uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12,'0')}`,
};

const controller = createWorkoutSyncController(deps);
await controller.requestAutosync();
const autosyncId = state.pendingMutation.mutationId;
const completed = await controller.finishActiveWorkout();

assert(calls[0].mutationId === autosyncId && calls[1].mutationId === autosyncId,
  'finish must replay the exact pending autosync id first');
assert(calls.filter(c => c.kind === 'FINISH').length === 1, 'exactly one finish mutation must be created');
assert(calls[2].baseVersion === 3, 'finish must target recovered authoritative version');
assert(completed.version === 4 && completed.status === 'COMPLETED', 'authoritative completion must be returned');
assert(completions === 1, 'workout must complete exactly once');
