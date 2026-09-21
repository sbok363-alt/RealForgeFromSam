import {
  PendingWorkoutMutation,
  Workout,
  WorkoutSyncConflict,
} from '../types';
import { buildCompletionPayload } from './workout-session';

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
  createCompletedWorkout?: (
    operation: PendingWorkoutMutation,
    sourceWorkout: Workout
  ) => Promise<Workout>;
  completeWorkout?: (authoritative: Workout) => void;
  uuid?: () => string;
  now?: () => number;
}

export interface WorkoutSyncController {
  requestAutosync: () => Promise<Workout | undefined>;
  retryPending: () => Promise<Workout | undefined>;
  finishActiveWorkout: () => Promise<Workout>;
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

  function recordConflict(operation: PendingWorkoutMutation, error: any): boolean {
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
      return true;
    }
    return false;
  }

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

  function makeFinishOperation(workout: Workout): PendingWorkoutMutation {
    const state = deps.getState();
    const duration = workout.startedAt
      ? Math.max(0, Math.floor((now() - workout.startedAt) / 1000))
      : (workout.duration || 0);
    const completion = buildCompletionPayload(workout, now(), duration);

    if (!completion.updates.sets?.length) {
      throw new Error('EMPTY_WORKOUT');
    }

    return {
      mutationId: uuid(),
      kind: 'FINISH',
      workoutId: workout.id,
      baseVersion: workout.version || 1,
      updates: completion.updates,
      duration: completion.duration,
      volume: completion.totalVolume,
      capturedRevision: state.sessionRevision,
      createdAt: now(),
    };
  }

  async function deliverAutosync(
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
        !latest.syncConflict &&
        !!latest.activeWorkout &&
        (dirtyWhileInFlight || latest.sessionRevision > operation.capturedRevision);

      return authoritative;
    } catch (error: any) {
      recordConflict(operation, error);
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

  async function deliverFinish(operation: PendingWorkoutMutation): Promise<Workout> {
    if (inFlight) {
      throw new Error('FINISH_IN_FLIGHT');
    }

    const sourceWorkout = deps.getState().activeWorkout;
    if (!sourceWorkout) throw new Error('NO_ACTIVE_WORKOUT');

    inFlight = true;
    try {
      let authoritative: Workout;
      try {
        authoritative = await deps.mutate(operation);
      } catch (error: any) {
        if (recordConflict(operation, error)) {
          throw error;
        }

        if (error?.status === 404 && deps.createCompletedWorkout) {
          authoritative = await deps.createCompletedWorkout(operation, sourceWorkout);
        } else {
          // Keep FINISH pending on unknown outcome so retry uses the exact ID.
          throw error;
        }
      }

      deps.clearPendingMutation(operation.mutationId);
      deps.setLastSyncedAt(now());
      deps.completeWorkout?.(authoritative);
      return authoritative;
    } finally {
      inFlight = false;
    }
  }

  async function retryPending(): Promise<Workout | undefined> {
    const state = deps.getState();
    if (state.syncConflict) return undefined;
    if (!state.pendingMutation) return undefined;

    if (state.pendingMutation.kind === 'FINISH') {
      return deliverFinish(state.pendingMutation);
    }
    return deliverAutosync(state.pendingMutation);
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
    return deliverAutosync(operation);
  }

  async function finishActiveWorkout(): Promise<Workout> {
    let state = deps.getState();
    if (!state.activeWorkout) throw new Error('NO_ACTIVE_WORKOUT');

    // A lost AUTOSYNC response may already represent a committed server write.
    // Never abandon it for FINISH: replay the exact logical operation first.
    if (state.pendingMutation?.kind === 'AUTOSYNC') {
      await retryPending();
      state = deps.getState();

      if (state.pendingMutation?.kind === 'AUTOSYNC') {
        throw new Error('AUTOSYNC_PENDING');
      }
      if (state.syncConflict) {
        throw new Error('SYNC_CONFLICT');
      }
      if (!state.activeWorkout) {
        throw new Error('NO_ACTIVE_WORKOUT');
      }
    }

    if (state.syncConflict) throw new Error('SYNC_CONFLICT');

    const operation = state.pendingMutation?.kind === 'FINISH'
      ? state.pendingMutation
      : makeFinishOperation(state.activeWorkout);

    if (state.pendingMutation?.kind !== 'FINISH') {
      deps.queuePendingMutation(operation);
    }

    return deliverFinish(operation);
  }

  return {
    requestAutosync,
    retryPending,
    finishActiveWorkout,
    isInFlight: () => inFlight,
  };
}
