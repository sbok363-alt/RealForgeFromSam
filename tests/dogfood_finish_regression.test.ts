import { createWorkoutSyncController } from '../src/lib/workout-sync';
import { PendingWorkoutMutation, Workout, WorkoutSyncConflict } from '../src/types';
import { reconcileAuthoritativeWorkout } from '../src/lib/workout-reconcile';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function makeWorkout(version = 1, status: Workout['status'] = 'IN_PROGRESS'): Workout {
  return {
    id: 'w_finish',
    userId: 'u1',
    title: 'Push',
    scheduledDate: '2026-09-21',
    status,
    version,
    sets: [],
    startedAt: 1_000,
    exercises: [{
      id: 'ex1',
      exerciseId: 'bench',
      sets: [
        { id: 's_done', weight: 80, reps: 8, completed: true, setType: 'N' },
        { id: 's_typed', weight: 90, reps: 5, completed: false, setType: 'N' },
      ],
    }],
  };
}

type Harness = {
  activeWorkout: Workout | null;
  sessionRevision: number;
  pendingMutation: PendingWorkoutMutation | null;
  syncConflict: WorkoutSyncConflict | null;
  lastSyncedAt: number | null;
};

function depsFor(
  state: Harness,
  mutate: (op: PendingWorkoutMutation) => Promise<Workout>,
  uuids: string[],
  completed: Workout[]
) {
  return {
    getState: () => state,
    queuePendingMutation: (op: PendingWorkoutMutation) => { state.pendingMutation = op; },
    clearPendingMutation: (id?: string) => {
      if (!id || state.pendingMutation?.mutationId === id) state.pendingMutation = null;
    },
    applyAuthoritativeWorkout: (server: Workout, capturedRevision: number) => {
      if (!state.activeWorkout) return;
      state.activeWorkout = reconcileAuthoritativeWorkout(
        state.activeWorkout, server, capturedRevision, state.sessionRevision
      );
    },
    setSyncConflict: (conflict: WorkoutSyncConflict | null) => { state.syncConflict = conflict; },
    setLastSyncedAt: (value: number) => { state.lastSyncedAt = value; },
    mutate,
    createCompletedWorkout: async (_op: PendingWorkoutMutation, source: Workout) => ({
      ...source,
      status: 'COMPLETED' as const,
      version: 1,
    }),
    completeWorkout: (authoritative: Workout) => {
      completed.push(authoritative);
      state.activeWorkout = null;
      state.pendingMutation = null;
    },
    uuid: () => {
      const next = uuids.shift();
      if (!next) throw new Error('unexpected uuid request');
      return next;
    },
    now: () => 100_000,
  };
}

async function testFinishFailureKeepsDraftAndId() {
  const state: Harness = {
    activeWorkout: makeWorkout(2),
    sessionRevision: 4,
    pendingMutation: null,
    syncConflict: null,
    lastSyncedAt: null,
  };
  const calls: PendingWorkoutMutation[] = [];
  const completed: Workout[] = [];
  let fail = true;
  const controller = createWorkoutSyncController(depsFor(
    state,
    async (op) => {
      calls.push({ ...op });
      if (fail) {
        fail = false;
        throw Object.assign(new Error('network lost'), { status: 0 });
      }
      return { ...makeWorkout(3, 'COMPLETED'), ...op.updates, version: 3 } as Workout;
    },
    ['finish-1'],
    completed
  ));

  let firstFailed = false;
  try { await controller.finishActiveWorkout(); } catch { firstFailed = true; }
  assert(firstFailed, 'unknown finish outcome must surface as retryable failure');
  assert(state.activeWorkout !== null, 'finish failure must preserve active draft');
  assert(state.pendingMutation?.kind === 'FINISH', 'finish operation must remain pending');
  assert(state.pendingMutation?.mutationId === 'finish-1', 'pending finish id must persist');

  const authoritative = await controller.finishActiveWorkout();
  assert(calls[0].mutationId === calls[1].mutationId, 'finish retry must reuse mutation id');
  assert(authoritative.version === 3, 'retry must return authoritative server workout');
  assert(completed.length === 1, 'logical completion must clear active workout exactly once');
}

async function testAuthoritativeObjectIsHandedOff() {
  const state: Harness = {
    activeWorkout: makeWorkout(7),
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    lastSyncedAt: null,
  };
  const completed: Workout[] = [];
  const server = {
    ...makeWorkout(8, 'COMPLETED'),
    title: 'Server Normalized Push',
    completedAt: 123_456,
  };
  const controller = createWorkoutSyncController(depsFor(
    state,
    async () => server,
    ['finish-authoritative'],
    completed
  ));

  const result = await controller.finishActiveWorkout();
  assert(result === server, 'finish must resolve with the exact authoritative server object');
  assert(completed[0] === server, 'post-finish handoff must receive authoritative server object');
}

async function testPendingAutosyncIsDrainedBeforeFinish() {
  const state: Harness = {
    activeWorkout: makeWorkout(1),
    sessionRevision: 2,
    pendingMutation: {
      mutationId: 'autosync-lost',
      kind: 'AUTOSYNC',
      workoutId: 'w_finish',
      baseVersion: 1,
      updates: {
        title: 'Push',
        scheduledDate: '2026-09-21',
        status: 'IN_PROGRESS',
        exercises: makeWorkout(1).exercises,
      },
      capturedRevision: 2,
      createdAt: 90_000,
    },
    syncConflict: null,
    lastSyncedAt: null,
  };

  const calls: PendingWorkoutMutation[] = [];
  const completed: Workout[] = [];
  const controller = createWorkoutSyncController(depsFor(
    state,
    async (op) => {
      calls.push({ ...op });
      if (op.kind === 'AUTOSYNC') {
        // Represents idempotent replay after the original response was lost.
        return { ...makeWorkout(2), ...op.updates, version: 2 } as Workout;
      }
      return { ...makeWorkout(3, 'COMPLETED'), ...op.updates, version: 3 } as Workout;
    },
    ['finish-after-drain'],
    completed
  ));

  const result = await controller.finishActiveWorkout();

  assert(calls.length === 2, 'drain + finish should create exactly two deliveries');
  assert(calls[0].kind === 'AUTOSYNC', 'pending autosync must replay first');
  assert(calls[0].mutationId === 'autosync-lost', 'pending autosync must reuse exact mutation id');
  assert(calls[1].kind === 'FINISH', 'one finish mutation should follow successful drain');
  assert(calls[1].mutationId === 'finish-after-drain', 'finish gets one new logical mutation id');
  assert(calls[1].baseVersion === 2, 'finish must target authoritative version recovered by autosync replay');
  assert(result.version === 3 && result.status === 'COMPLETED', 'finish should complete once');
  assert(completed.length === 1, 'completed workout handoff must happen exactly once');
}

await testFinishFailureKeepsDraftAndId();
await testAuthoritativeObjectIsHandedOff();
await testPendingAutosyncIsDrainedBeforeFinish();
console.log('✔ Dogfood finish regression passed');
