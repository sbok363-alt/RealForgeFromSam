import { createWorkoutSyncController, WorkoutSyncControllerDeps } from '../src/lib/workout-sync';
import { projectCompletedWorkingSets } from '../src/lib/workout-session';
import { PendingWorkoutMutation, Workout } from '../src/types';

function assert(value: boolean, message: string) { if (!value) throw new Error(message); }

const startedAt = Date.now() - 60_000;
let state: any = {
  activeWorkout: {
    id:'gate1', userId:'u1', title:'Push', scheduledDate:new Date().toISOString().slice(0,10),
    status:'IN_PROGRESS', version:1, sets:[],
    exercises:[{id:'ex1',exerciseId:'bench_press',sets:[
      {id:'completed_a',weight:80,reps:8,completed:true,setType:'N'},
      {id:'typed_incomplete_b',weight:85,reps:8,completed:false,setType:'N'},
      {id:'completed_c',weight:82.5,reps:8,completed:true,setType:'N'},
    ]}],
  } as Workout,
  sessionRevision:2, pendingMutation:null, syncConflict:null, startedAt,
};
let server = state.activeWorkout as Workout;
const calls: PendingWorkoutMutation[] = [];
let loseFirst = true;
let uuidCounter = 0;
let history: Workout | null = null;

const deps: WorkoutSyncControllerDeps = {
  getState: () => state,
  mutate: async (op) => {
    calls.push(op);
    if (op.kind === 'AUTOSYNC' && loseFirst) {
      loseFirst = false;
      server = { ...server, ...op.updates, version:2 };
      throw new Error('lost response');
    }
    if (op.kind === 'AUTOSYNC') return server;
    server = { ...server, ...op.updates, version:3 } as Workout;
    return server;
  },
  createWorkout: async () => { throw new Error('unused'); },
  queuePendingMutation: (op) => { state = { ...state, pendingMutation:op }; },
  clearPendingMutation: () => { state = { ...state, pendingMutation:null }; },
  applyAuthoritativeWorkout: (w) => { state = { ...state, activeWorkout:w }; },
  setSyncConflict: (v) => { state = { ...state, syncConflict:v }; },
  setSyncError: (v) => { state = { ...state, syncError:v }; },
  completeWorkout: () => { state = { ...state, activeWorkout:null }; },
  upsertAuthoritativeWorkoutCache: async (w) => { history = w; },
  now: () => startedAt + 60_000,
  uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`,
};

const controller = createWorkoutSyncController(deps);
await controller.requestAutosync();
const pendingId = state.pendingMutation.mutationId;

// persisted pending state is intentionally retained across this simulated reload
const completed = await controller.finishActiveWorkout();

assert(calls[0].mutationId === pendingId && calls[1].mutationId === pendingId,
  'lost autosync response must replay the same logical id');
assert(calls.filter(c => c.kind === 'FINISH').length === 1, 'finish must be one logical mutation');
assert(completed.status === 'COMPLETED' && completed.version === 3, 'history must use authoritative completion');
assert(history?.id === completed.id && history?.version === completed.version, 'cached history must be authoritative');

const ids = projectCompletedWorkingSets(completed).map(s => s.id);
assert(ids.join(',') === 'completed_a,completed_c', 'typed incomplete set must not become phantom history');
assert(projectCompletedWorkingSets(completed).reduce((sum,s)=>sum+s.weight*s.reps,0) === 1300,
  'canonical volume must match completed working sets');
