import {
  PendingWorkoutMutation,
  Workout,
  WorkoutSyncConflict,
} from '../types';

export interface WorkoutSyncStateSnapshot {
  activeWorkout: Workout | null;
  sessionRevision: number;
  pendingMutation: PendingWorkoutMutation | null;
  syncConflict: WorkoutSyncConflict | null;
}

export interface WorkoutSyncControllerDeps {
  getState: () => WorkoutSyncStateSnapshot;
  queuePendingMutation: (operation: PendingWorkoutMutation) => void;
  clearPendingMutation: (mutationId?: string) => void;
  applyAuthoritativeWorkout: (workout: Workout, capturedRevision: number) => void;
  setSyncConflict: (conflict: WorkoutSyncConflict | null) => void;
  setLastSyncedAt: (timestamp: number) => void;
  mutate: (operation: PendingWorkoutMutation) => Promise<Workout>;
  uuid?: () => string;
  now?: () => number;
}

export interface WorkoutSyncController {
  requestAutosync: () => Promise<Workout | undefined>;
  retryPending: () => Promise<Workout | undefined>;
  isInFlight: () => boolean;
}

function buildAutosyncUpdates(workout: Workout): Partial<Workout> {
  const hasExercises = Array.isArray(workout.exercises) && workout.exercises.length > 0;
  return {
    title: workout.title,
    scheduledDate: workout.scheduledDate,
    status: workout.status,
    ...(hasExercises
      ? { exercises: workout.exercises }
      : { sets: workout.sets || [] }),
  };
}

export function createWorkoutSyncController(
  deps: WorkoutSyncControllerDeps
): WorkoutSyncController {
  const uuid = deps.uuid || (() => crypto.randomUUID());
  const now = deps.now || (() => Date.now());
  let inFlight = false;
  let dirtyWhileInFlight = false;

  function makeAutosyncOperation(): PendingWorkoutMutation | null {
    const state = deps.getState();
    const workout = state.activeWorkout;
    if (!workout || state.syncConflict) return null;

    return {
      mutationId: uuid(),
      kind: 'AUTOSYNC',
      workoutId: workout.id,
      baseVersion: workout.version || 1,
      updates: buildAutosyncUpdates(workout),
      duration: workout.startedAt
        ? Math.max(0, Math.floor((now() - workout.startedAt) / 1000))
        : workout.duration,
      volume: workout.volume,
      capturedRevision: state.sessionRevision,
      createdAt: now(),
    };
  }

  async function deliver(
    operation: PendingWorkoutMutation
  ): Promise<Workout | undefined> {
    if (inFlight) {
      dirtyWhileInFlight = true;
      return undefined;
    }

    inFlight = true;
    let followUp = false;
    try {
      const authoritative = await deps.mutate(operation);
      deps.applyAuthoritativeWorkout(authoritative, operation.capturedRevision);
      deps.clearPendingMutation(operation.mutationId);
      deps.setLastSyncedAt(now());

      const latest = deps.getState();
      followUp =
        operation.kind === 'AUTOSYNC' &&
        !latest.syncConflict &&
        !!latest.activeWorkout &&
        (dirtyWhileInFlight || latest.sessionRevision > operation.capturedRevision);

      return authoritative;
    } catch (error: any) {
      if (
        error?.status === 409 &&
        error?.workout &&
        typeof error.workout.version === 'number'
      ) {
        deps.clearPendingMutation(operation.mutationId);
        deps.setSyncConflict({
          mutationId: operation.mutationId,
          currentVersion: error.currentVersion ?? error.workout.version,
          serverWorkout: error.workout,
          detectedAt: now(),
        });
      }
      // Unknown network/server outcomes intentionally keep the persisted
      // pending operation so a later retry reuses the same mutation ID.
      return undefined;
    } finally {
      inFlight = false;
      const shouldFollowUp = followUp;
      dirtyWhileInFlight = false;
      if (shouldFollowUp) {
        await requestAutosync();
      }
    }
  }

  async function retryPending(): Promise<Workout | undefined> {
    const state = deps.getState();
    if (state.syncConflict) return undefined;
    if (!state.pendingMutation) return undefined;
    return deliver(state.pendingMutation);
  }

  async function requestAutosync(): Promise<Workout | undefined> {
    const state = deps.getState();
    if (!state.activeWorkout || state.syncConflict) return undefined;

    if (inFlight) {
      dirtyWhileInFlight = true;
      return undefined;
    }

    if (state.pendingMutation) {
      return retryPending();
    }

    const operation = makeAutosyncOperation();
    if (!operation) return undefined;

    deps.queuePendingMutation(operation);
    return deliver(operation);
  }

  return {
    requestAutosync,
    retryPending,
    isInFlight: () => inFlight,
  };
}
