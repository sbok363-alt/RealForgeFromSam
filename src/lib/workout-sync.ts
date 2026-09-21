import { PendingWorkoutMutation, Workout, WorkoutSyncConflict } from '../types';
import { buildCompletionPayload } from './workout-session';
import { reconcileAuthoritativeWorkout } from './workout-reconcile';

export interface WorkoutSyncState {
  activeWorkout: Workout | null;
  sessionRevision: number;
  pendingMutation: PendingWorkoutMutation | null;
  syncConflict: WorkoutSyncConflict | null;
  startedAt: number | null;
}

export interface WorkoutSyncControllerDeps {
  getState(): WorkoutSyncState;
  mutate(operation: PendingWorkoutMutation): Promise<Workout>;
  createWorkout(operation: PendingWorkoutMutation): Promise<Workout>;
  queuePendingMutation(operation: PendingWorkoutMutation): void;
  clearPendingMutation(): void;
  applyAuthoritativeWorkout(workout: Workout): void;
  setSyncConflict(conflict: WorkoutSyncConflict | null): void;
  setSyncError(error: string | null): void;
  completeWorkout(workout: Workout): void;
  upsertAuthoritativeWorkoutCache(workout: Workout): Promise<void>;
  now(): number;
  uuid(): string;
}

function autosyncUpdates(workout: Workout): Partial<Workout> {
  const common = {
    title: workout.title,
    scheduledDate: workout.scheduledDate,
    status: workout.status,
  };
  return workout.exercises?.length
    ? { ...common, exercises: workout.exercises }
    : { ...common, sets: workout.sets || [] };
}

function errorStatus(error: any): number | undefined {
  return typeof error?.status === 'number' ? error.status : undefined;
}

export function createWorkoutSyncController(deps: WorkoutSyncControllerDeps) {
  let inFlight = false;

  const recordConflict = (operation: PendingWorkoutMutation, error: any, message: string) => {
    if (errorStatus(error) !== 409 || !error.workout) return false;
    deps.clearPendingMutation();
    deps.setSyncConflict({
      mutationId: operation.mutationId,
      currentVersion: error.currentVersion ?? error.workout.version,
      serverWorkout: error.workout,
      detectedAt: deps.now(),
    });
    deps.setSyncError(message);
    return true;
  };

  const transmit = async (
    operation: PendingWorkoutMutation
  ): Promise<{ authoritative: Workout; operation: PendingWorkoutMutation }> => {
    let currentOperation = operation;

    if (currentOperation.delivery === 'CREATE') {
      return {
        authoritative: await deps.createWorkout(currentOperation),
        operation: currentOperation,
      };
    }

    try {
      return {
        authoritative: await deps.mutate(currentOperation),
        operation: currentOperation,
      };
    } catch (error: any) {
      if (errorStatus(error) !== 404) throw error;
      const current = deps.getState();
      if (!current.activeWorkout) throw error;

      currentOperation = {
        ...currentOperation,
        delivery: 'CREATE',
        createSnapshot: currentOperation.createSnapshot || ({
          ...current.activeWorkout,
          ...currentOperation.updates,
          id: currentOperation.workoutId,
        } as Workout),
      };
      deps.queuePendingMutation(currentOperation);

      return {
        authoritative: await deps.createWorkout(currentOperation),
        operation: currentOperation,
      };
    }
  };

  const deliverAutosync = async (operation: PendingWorkoutMutation): Promise<Workout | null> => {
    if (inFlight) return null;
    inFlight = true;
    let currentOperation = operation;
    try {
      const sent = await transmit(operation);
      currentOperation = sent.operation;
      const authoritative = sent.authoritative;

      const current = deps.getState();
      if (!current.activeWorkout) return authoritative;
      const reconciled = reconcileAuthoritativeWorkout(
        current.activeWorkout,
        authoritative,
        currentOperation.capturedRevision,
        current.sessionRevision
      );
      deps.applyAuthoritativeWorkout(reconciled);
      deps.clearPendingMutation();
      deps.setSyncError(null);
      return authoritative;
    } catch (error: any) {
      if (!recordConflict(
        currentOperation,
        error,
        'Workout changed on the server. Resolve the conflict before syncing.'
      )) {
        deps.setSyncError(error?.message || 'Workout sync failed');
      }
      return null;
    } finally {
      inFlight = false;
    }
  };

  const deliverFinish = async (
    operation: PendingWorkoutMutation,
    propagateError: boolean
  ): Promise<Workout | null> => {
    if (inFlight) {
      if (propagateError) throw new Error('SYNC_IN_FLIGHT');
      return null;
    }

    inFlight = true;
    let currentOperation = operation;
    try {
      const sent = await transmit(operation);
      currentOperation = sent.operation;
      const authoritative = sent.authoritative;

      await deps.upsertAuthoritativeWorkoutCache(authoritative);
      deps.setSyncError(null);
      deps.completeWorkout(authoritative);
      return authoritative;
    } catch (error: any) {
      if (!recordConflict(currentOperation, error, 'Workout finish conflicted with the server.')) {
        deps.setSyncError(error?.message || 'Workout finish failed');
      }
      if (propagateError) throw error;
      return null;
    } finally {
      inFlight = false;
    }
  };

  const retryPending = async (): Promise<Workout | null> => {
    const pending = deps.getState().pendingMutation;
    if (!pending) return null;
    return pending.kind === 'FINISH'
      ? deliverFinish(pending, false)
      : deliverAutosync(pending);
  };

  const requestAutosync = async (): Promise<Workout | null> => {
    const state = deps.getState();
    if (!state.activeWorkout || state.syncConflict) return null;
    if (state.pendingMutation) return retryPending();
    if (inFlight) return null;

    const updates = autosyncUpdates(state.activeWorkout);
    const operation: PendingWorkoutMutation = {
      mutationId: deps.uuid(),
      kind: 'AUTOSYNC',
      delivery: 'MUTATE',
      workoutId: state.activeWorkout.id,
      baseVersion: state.activeWorkout.version,
      updates,
      duration: state.startedAt ? Math.max(0, Math.floor((deps.now() - state.startedAt) / 1000)) : undefined,
      volume: state.activeWorkout.volume,
      capturedRevision: state.sessionRevision,
      createdAt: deps.now(),
      createSnapshot: { ...state.activeWorkout, ...updates },
    };
    deps.queuePendingMutation(operation);
    const authoritative = await deliverAutosync(operation);

    const after = deps.getState();
    if (
      authoritative &&
      after.activeWorkout &&
      !after.pendingMutation &&
      !after.syncConflict &&
      after.sessionRevision > operation.capturedRevision
    ) {
      return requestAutosync();
    }
    return authoritative;
  };

  const finishActiveWorkout = async (): Promise<Workout> => {
    let state = deps.getState();
    if (!state.activeWorkout) throw new Error('NO_ACTIVE_WORKOUT');
    if (state.syncConflict) throw new Error('SYNC_CONFLICT');

    if (state.pendingMutation?.kind === 'AUTOSYNC') {
      const drained = await retryPending();
      state = deps.getState();
      if (!drained || state.pendingMutation?.kind === 'AUTOSYNC') throw new Error('AUTOSYNC_PENDING');
      if (state.syncConflict) throw new Error('SYNC_CONFLICT');
      if (!state.activeWorkout) throw new Error('NO_ACTIVE_WORKOUT');
    }

    let operation = state.pendingMutation;
    if (!operation) {
      const completedAt = deps.now();
      const startedAt = state.startedAt || state.activeWorkout.startedAt || completedAt;
      const completion = buildCompletionPayload(
        state.activeWorkout,
        completedAt,
        Math.max(0, Math.floor((completedAt - startedAt) / 1000))
      );
      if (!(completion.updates.sets?.length)) throw new Error('EMPTY_WORKOUT');
      operation = {
        mutationId: deps.uuid(),
        kind: 'FINISH',
        delivery: 'MUTATE',
        workoutId: state.activeWorkout.id,
        baseVersion: state.activeWorkout.version,
        updates: completion.updates,
        duration: completion.duration,
        volume: completion.totalVolume,
        capturedRevision: state.sessionRevision,
        createdAt: completedAt,
        createSnapshot: { ...state.activeWorkout, ...completion.updates } as Workout,
      };
      deps.queuePendingMutation(operation);
    }
    if (operation.kind !== 'FINISH') throw new Error('AUTOSYNC_PENDING');

    const authoritative = await deliverFinish(operation, true);
    if (!authoritative) throw new Error('WORKOUT_FINISH_PENDING');
    return authoritative;
  };

  return {
    requestAutosync,
    retryPending,
    finishActiveWorkout,
    isInFlight: () => inFlight,
  };
}
