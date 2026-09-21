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
  createWorkout: async () => { throw new Error('unused'); },
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


// Regression: a locally-created session may not exist on the server yet.
// If AUTOSYNC falls back to CREATE and that create response is lost, retry must
// stay on CREATE with the same logical mutation id before FINISH is created.
{
  const unsaved: Workout = {
    id:'w_unsaved', userId:'u1', title:'Plan Session', scheduledDate:'2026-09-21',
    status:'IN_PROGRESS', version:1, sets:[],
    exercises:[{id:'ex1',exerciseId:'bench_press',sets:[{id:'s1',weight:80,reps:8,completed:true,setType:'N'}]}],
  };
  let localState: any = {
    activeWorkout: unsaved, sessionRevision:1, pendingMutation:null,
    syncConflict:null, startedAt:1000,
  };
  let serverWorkout: Workout | null = null;
  let createdMutationId: string | null = null;
  let loseCreateResponse = true;
  let localIds = 0;
  const mutateCalls: PendingWorkoutMutation[] = [];
  const createCalls: PendingWorkoutMutation[] = [];

  const notFound = () => Object.assign(new Error('Workout not found'), { status:404 });
  const idempConflict = () => Object.assign(new Error('Idempotency conflict'), { status:409 });

  const unsavedDeps: any = {
    getState: () => localState,
    mutate: async (op: PendingWorkoutMutation) => {
      mutateCalls.push(op);
      if (!serverWorkout) throw notFound();
      if (createdMutationId === op.mutationId) throw idempConflict();
      assert(op.kind === 'FINISH', 'after create replay, only FINISH may mutate the existing server workout');
      assert(op.baseVersion === serverWorkout.version, 'finish must use authoritative create version');
      serverWorkout = { ...serverWorkout, ...op.updates, version:serverWorkout.version + 1 } as Workout;
      return serverWorkout;
    },
    createWorkout: async (op: PendingWorkoutMutation) => {
      createCalls.push(op);
      if (!serverWorkout) {
        createdMutationId = op.mutationId;
        serverWorkout = {
          ...unsaved,
          ...op.updates,
          version:1,
          sets: op.updates.sets || unsaved.sets,
          exercises: op.updates.exercises || unsaved.exercises,
        } as Workout;
        if (loseCreateResponse) {
          loseCreateResponse = false;
          throw new Error('create response lost');
        }
      }
      assert(op.mutationId === createdMutationId, 'create replay must reuse the same autosync mutation id');
      return serverWorkout;
    },
    queuePendingMutation: (op: PendingWorkoutMutation) => { localState = { ...localState, pendingMutation:op }; },
    clearPendingMutation: () => { localState = { ...localState, pendingMutation:null }; },
    applyAuthoritativeWorkout: (w: Workout) => { localState = { ...localState, activeWorkout:w }; },
    setSyncConflict: (v: any) => { localState = { ...localState, syncConflict:v }; },
    setSyncError: (v: any) => { localState = { ...localState, syncError:v }; },
    completeWorkout: () => { localState = { ...localState, activeWorkout:null, pendingMutation:null }; },
    upsertAuthoritativeWorkoutCache: async () => {},
    now: () => 5000,
    uuid: () => `10000000-0000-4000-8000-${String(++localIds).padStart(12,'0')}`,
  };

  const unsavedController = createWorkoutSyncController(unsavedDeps);
  await unsavedController.requestAutosync();
  const autosyncId = localState.pendingMutation?.mutationId;
  assert(Boolean(autosyncId), 'lost create response must leave the autosync pending');
  assert(localState.pendingMutation?.delivery === 'CREATE', 'pending autosync must persist CREATE delivery after mutate 404');

  const completedUnsaved = await unsavedController.finishActiveWorkout();
  assert(createCalls.length === 2, 'finish must replay the lost CREATE exactly once');
  assert(createCalls[0].mutationId === autosyncId && createCalls[1].mutationId === autosyncId,
    'both create attempts must reuse the same autosync mutation id');
  assert(mutateCalls.filter(op => op.kind === 'AUTOSYNC').length === 1,
    'pending CREATE replay must not fall back to mutate again');
  assert(mutateCalls.filter(op => op.kind === 'FINISH').length === 1,
    'exactly one FINISH mutation must be created after autosync create replay');
  assert(completedUnsaved.status === 'COMPLETED' && completedUnsaved.version === 2,
    'unsaved local session must finish exactly once from authoritative version 1');
}


// Regression: successful FINISH must clear active + pending state through one
// completion transition. A separate pending-clear write can persist an
// in-progress workout with no replay key if the final localStorage write fails.
{
  let atomicState: any = {
    activeWorkout: base,
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    startedAt: 1000,
  };
  let explicitPendingClears = 0;
  let atomicIds = 0;
  const atomicDeps: WorkoutSyncControllerDeps = {
    getState: () => atomicState,
    mutate: async (op) => ({ ...base, ...op.updates, version:3 } as Workout),
    createWorkout: async () => { throw new Error('unused'); },
    queuePendingMutation: (op) => { atomicState = { ...atomicState, pendingMutation:op }; },
    clearPendingMutation: () => {
      explicitPendingClears++;
      atomicState = { ...atomicState, pendingMutation:null };
    },
    applyAuthoritativeWorkout: (w) => { atomicState = { ...atomicState, activeWorkout:w }; },
    setSyncConflict: (v) => { atomicState = { ...atomicState, syncConflict:v }; },
    setSyncError: (v) => { atomicState = { ...atomicState, syncError:v }; },
    completeWorkout: () => {
      atomicState = { ...atomicState, activeWorkout:null, pendingMutation:null };
    },
    upsertAuthoritativeWorkoutCache: async () => {},
    now: () => 5000,
    uuid: () => `20000000-0000-4000-8000-${String(++atomicIds).padStart(12,'0')}`,
  };

  await createWorkoutSyncController(atomicDeps).finishActiveWorkout();
  assert(explicitPendingClears === 0,
    'finish success must not persist a separate pending-clear before the atomic completion transition');
  assert(atomicState.activeWorkout === null && atomicState.pendingMutation === null,
    'completion transition must clear active workout and pending finish together');
}


// Regression: background/on-reload retry of a pending FINISH must run finish
// completion semantics, not the autosync reconciliation path.
{
  let retryState: any = {
    activeWorkout: base,
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    startedAt: 1000,
  };
  let serverCommitted: Workout | null = null;
  let loseFinishResponse = true;
  let retryCompletions = 0;
  let retryIds = 0;
  const retryCalls: PendingWorkoutMutation[] = [];

  const retryDeps: WorkoutSyncControllerDeps = {
    getState: () => retryState,
    mutate: async (op) => {
      retryCalls.push(op);
      if (!serverCommitted) {
        serverCommitted = { ...base, ...op.updates, version:3 } as Workout;
        if (loseFinishResponse) {
          loseFinishResponse = false;
          throw new Error('finish response lost');
        }
      }
      return serverCommitted;
    },
    createWorkout: async () => { throw new Error('unused'); },
    queuePendingMutation: (op) => { retryState = { ...retryState, pendingMutation:op }; },
    clearPendingMutation: () => { retryState = { ...retryState, pendingMutation:null }; },
    applyAuthoritativeWorkout: (w) => { retryState = { ...retryState, activeWorkout:w }; },
    setSyncConflict: (v) => { retryState = { ...retryState, syncConflict:v }; },
    setSyncError: (v) => { retryState = { ...retryState, syncError:v }; },
    completeWorkout: () => {
      retryCompletions++;
      retryState = { ...retryState, activeWorkout:null, pendingMutation:null };
    },
    upsertAuthoritativeWorkoutCache: async () => {},
    now: () => 5000,
    uuid: () => `30000000-0000-4000-8000-${String(++retryIds).padStart(12,'0')}`,
  };

  const retryController = createWorkoutSyncController(retryDeps);
  let firstFailed = false;
  try {
    await retryController.finishActiveWorkout();
  } catch {
    firstFailed = true;
  }
  assert(firstFailed && retryState.pendingMutation?.kind === 'FINISH',
    'lost finish response must leave FINISH pending');
  const finishId = retryState.pendingMutation.mutationId;

  const replayed = await retryController.retryPending();
  assert(replayed?.status === 'COMPLETED', 'background finish replay must recover authoritative completion');
  assert(retryCalls.length === 2 && retryCalls[0].mutationId === finishId && retryCalls[1].mutationId === finishId,
    'background retry must reuse the exact finish mutation id');
  assert(retryCompletions === 1, 'background finish replay must execute completion transition exactly once');
  assert(retryState.activeWorkout === null && retryState.pendingMutation === null,
    'background finish replay must not leave a completed workout active');
}
