import { useEffect, useRef } from 'react';
import { mutateWorkout } from '../lib/api';
import { createWorkoutSyncController, WorkoutSyncController } from '../lib/workout-sync';
import { useWorkoutStore } from '../store/useWorkoutStore';

export function useWorkoutSessionSync(): WorkoutSyncController {
  const activeWorkoutId = useWorkoutStore((state) => state.activeWorkout?.id);
  const controllerRef = useRef<WorkoutSyncController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createWorkoutSyncController({
      getState: () => useWorkoutStore.getState(),
      queuePendingMutation: (operation) =>
        useWorkoutStore.getState().queuePendingMutation(operation),
      clearPendingMutation: (mutationId) =>
        useWorkoutStore.getState().clearPendingMutation(mutationId),
      applyAuthoritativeWorkout: (workout, capturedRevision) =>
        useWorkoutStore.getState().applyAuthoritativeWorkout(workout, capturedRevision),
      setSyncConflict: (conflict) =>
        useWorkoutStore.getState().setSyncConflict(conflict),
      setLastSyncedAt: (timestamp) =>
        useWorkoutStore.getState().setLastSyncedAt(timestamp),
      mutate: (operation) =>
        mutateWorkout(
          operation.workoutId,
          operation.baseVersion,
          operation.updates,
          {
            mutationId: operation.mutationId,
            duration: operation.duration,
            volume: operation.volume,
          }
        ),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    if (!activeWorkoutId) return;

    if (useWorkoutStore.getState().pendingMutation) {
      void controller.retryPending();
    }

    const interval = setInterval(() => {
      void controller.requestAutosync();
    }, 45_000);

    const handleOnline = () => {
      if (useWorkoutStore.getState().pendingMutation) {
        void controller.retryPending();
      } else {
        void controller.requestAutosync();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [activeWorkoutId]);

  return controllerRef.current;
}
