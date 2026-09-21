import { createWorkoutSyncController } from '../src/lib/workout-sync';
import { PendingWorkoutMutation, Workout, WorkoutSyncConflict } from '../src/types';
import { reconcileAuthoritativeWorkout } from '../src/lib/workout-reconcile';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function workout(version = 1, weight = 80): Workout {
  return {
    id: 'w1',
    userId: 'u1',
    title: 'Push',
    scheduledDate: '2026-09-21',
    status: 'IN_PROGRESS',
    version,
    sets: [],
    startedAt: 1000,
    exercises: [{
      id: 'ex1',
      exerciseId: 'bench',
      sets: [{ id: 's1', weight, reps: 8, completed: true }],
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

async function testRetryReusesLogicalId() {
  const state: Harness = {
    activeWorkout: workout(),
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    lastSyncedAt: null,
  };
  const calls: PendingWorkoutMutation[] = [];
  let failFirst = true;

  const controller = createWorkoutSyncController({
    getState: () => state,
    queuePendingMutation: (op) => { state.pendingMutation = op; },
    clearPendingMutation: (id) => {
      if (!id || state.pendingMutation?.mutationId === id) state.pendingMutation = null;
    },
    applyAuthoritativeWorkout: (server, capturedRevision) => {
      if (!state.activeWorkout) return;
      state.activeWorkout = reconcileAuthoritativeWorkout(
        state.activeWorkout, server, capturedRevision, state.sessionRevision
      );
    },
    setSyncConflict: (conflict) => { state.syncConflict = conflict; },
    setLastSyncedAt: (value) => { state.lastSyncedAt = value; },
    mutate: async (op) => {
      calls.push({ ...op });
      if (failFirst) {
        failFirst = false;
        throw Object.assign(new Error('network lost'), { status: 0 });
      }
      return { ...workout(2), ...op.updates, version: 2 } as Workout;
    },
    uuid: () => 'autosync-1',
    now: () => 50_000,
  });

  await controller.requestAutosync();
  assert(state.pendingMutation?.mutationId === 'autosync-1',
    'unknown network outcome must keep pending operation');
  await controller.retryPending();
  assert(calls.length === 2, 'retry should deliver twice');
  assert(calls[0].mutationId === calls[1].mutationId,
    'retry must reuse the exact logical mutation id');
  assert(state.activeWorkout?.version === 2, 'authoritative version must reconcile');
  assert(state.pendingMutation === null, 'successful replay must clear pending operation');
}

async function testEditDuringFlightQueuesOneFollowUp() {
  const state: Harness = {
    activeWorkout: workout(),
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    lastSyncedAt: null,
  };
  const calls: PendingWorkoutMutation[] = [];
  let firstResolve!: (value: Workout) => void;
  let concurrent = 0;
  let maxConcurrent = 0;

  const controller = createWorkoutSyncController({
    getState: () => state,
    queuePendingMutation: (op) => { state.pendingMutation = op; },
    clearPendingMutation: (id) => {
      if (!id || state.pendingMutation?.mutationId === id) state.pendingMutation = null;
    },
    applyAuthoritativeWorkout: (server, capturedRevision) => {
      if (!state.activeWorkout) return;
      state.activeWorkout = reconcileAuthoritativeWorkout(
        state.activeWorkout, server, capturedRevision, state.sessionRevision
      );
    },
    setSyncConflict: (conflict) => { state.syncConflict = conflict; },
    setLastSyncedAt: (value) => { state.lastSyncedAt = value; },
    mutate: async (op) => {
      calls.push({ ...op });
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        if (calls.length === 1) {
          return await new Promise<Workout>((resolve) => { firstResolve = resolve; });
        }
        return { ...workout(3, 82.5), ...op.updates, version: 3 } as Workout;
      } finally {
        concurrent--;
      }
    },
    uuid: (() => {
      let n = 0;
      return () => `sync-${++n}`;
    })(),
    now: () => 60_000,
  });

  const first = controller.requestAutosync();
  await Promise.resolve();

  state.activeWorkout = workout(1, 82.5);
  state.sessionRevision = 2;
  void controller.requestAutosync();

  firstResolve(workout(2, 80));
  await first;

  assert(maxConcurrent === 1, 'autosync writes must never overlap');
  assert(calls.length === 2, 'new local edit should schedule exactly one follow-up sync');
  assert(calls[1].baseVersion === 2, 'follow-up must use authoritative returned version');
  assert((calls[1].updates.exercises?.[0].sets[0].weight) === 82.5,
    'follow-up must contain the newer local edit');
}

async function testOccConflictBlocksAutosync() {
  const state: Harness = {
    activeWorkout: workout(),
    sessionRevision: 1,
    pendingMutation: null,
    syncConflict: null,
    lastSyncedAt: null,
  };

  const server = workout(3, 85);
  const controller = createWorkoutSyncController({
    getState: () => state,
    queuePendingMutation: (op) => { state.pendingMutation = op; },
    clearPendingMutation: (id) => {
      if (!id || state.pendingMutation?.mutationId === id) state.pendingMutation = null;
    },
    applyAuthoritativeWorkout: () => {},
    setSyncConflict: (conflict) => { state.syncConflict = conflict; },
    setLastSyncedAt: (value) => { state.lastSyncedAt = value; },
    mutate: async () => {
      throw Object.assign(new Error('stale'), {
        status: 409,
        currentVersion: 3,
        workout: server,
      });
    },
    uuid: () => 'conflict-1',
    now: () => 70_000,
  });

  await controller.requestAutosync();
  assert(state.pendingMutation === null, 'OCC conflict should clear pending delivery');
  assert(state.syncConflict?.currentVersion === 3, 'OCC conflict snapshot must persist');

  await controller.requestAutosync();
  assert(state.syncConflict?.serverWorkout.version === 3,
    'further autosync must remain blocked while conflict is unresolved');
}

await testRetryReusesLogicalId();
await testEditDuringFlightQueuesOneFollowUp();
await testOccConflictBlocksAutosync();
console.log('✔ Dogfood sync regression passed');
