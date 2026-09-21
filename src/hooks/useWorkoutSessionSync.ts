import { useEffect, useMemo } from 'react';
import { mutateWorkout, saveWorkout, upsertAuthoritativeWorkoutCache } from '../lib/api';
import { createWorkoutSyncController } from '../lib/workout-sync';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useAuthStore } from '../store/useAuthStore';
import { Workout } from '../types';

export function useWorkoutSessionSync() {
  const user = useAuthStore((state) => state.user);
  const activeWorkoutId = useWorkoutStore((state) => state.activeWorkout?.id);

  const controller = useMemo(() => createWorkoutSyncController({
    getState: () => {
      const state = useWorkoutStore.getState();
      return {
        activeWorkout: state.activeWorkout,
        sessionRevision: state.sessionRevision,
        pendingMutation: state.pendingMutation,
        syncConflict: state.syncConflict,
        startedAt: state.startedAt,
      };
    },
    mutate: (operation) => mutateWorkout(
      operation.workoutId,
      operation.baseVersion,
      operation.updates,
      {
        mutationId: operation.mutationId,
        duration: operation.duration,
        volume: operation.volume,
      }
    ),
    createCompletedWorkout: async (operation) => {
      const current = useWorkoutStore.getState().activeWorkout;
      if (!current) throw new Error('NO_ACTIVE_WORKOUT');
      const completed = {
        ...current,
        ...operation.updates,
        userId: user?.uid || current.userId,
      } as Workout;
      return saveWorkout(
        completed,
        'USER',
        `Completed active session: ${completed.title}`,
        { mutationId: operation.mutationId }
      );
    },
    queuePendingMutation: (operation) => useWorkoutStore.getState().queuePendingMutation(operation),
    clearPendingMutation: () => useWorkoutStore.getState().clearPendingMutation(),
    applyAuthoritativeWorkout: (workout) => useWorkoutStore.getState().applyAuthoritativeWorkout(workout),
    setSyncConflict: (conflict) => useWorkoutStore.getState().setSyncConflict(conflict),
    setSyncError: (error) => useWorkoutStore.getState().setSyncError(error),
    completeWorkout: () => useWorkoutStore.getState().finishWorkout(),
    upsertAuthoritativeWorkoutCache,
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
  }), [user?.uid]);

  useEffect(() => {
    if (!activeWorkoutId || !user?.uid) return;

    if (useWorkoutStore.getState().pendingMutation) {
      void controller.retryPending();
    }

    const interval = window.setInterval(() => {
      void controller.requestAutosync();
    }, 45_000);

    const onOnline = () => {
      if (useWorkoutStore.getState().pendingMutation) void controller.retryPending();
    };
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [activeWorkoutId, user?.uid, controller]);

  return {
    requestAutosync: controller.requestAutosync,
    retryPending: controller.retryPending,
    finishActiveWorkout: controller.finishActiveWorkout,
    isInFlight: controller.isInFlight,
  };
}
