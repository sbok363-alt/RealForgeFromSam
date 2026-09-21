import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  PendingWorkoutMutation,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutSetItem,
  WorkoutSyncConflict,
} from '../types';
import { reconcileAuthoritativeWorkout } from '../lib/workout-reconcile';
import { createSafeStateStorage } from '../lib/safe-storage';

export interface WorkoutState {
  activeWorkout: Workout | null;
  isModalOpen: boolean;
  startedAt: number | null;
  restEndTime: number | null;
  lastSyncedAt: number | null;
  activePRSetIds: string[];
  sessionRevision: number;
  pendingMutation: PendingWorkoutMutation | null;
  syncConflict: WorkoutSyncConflict | null;
  persistenceWarning: string | null;

  startWorkout: (workout: Workout) => void;
  openWorkoutModal: () => void;
  closeWorkoutModal: () => void;
  updateActiveWorkout: (workoutOrUpdater: Partial<Workout> | ((prev: Workout) => Workout)) => void;
  applyAuthoritativeWorkout: (workout: Workout, capturedRevision: number) => void;
  updateSetItem: (setId: string, updates: Partial<WorkoutSetItem>) => void;
  addSetItem: (setItem: WorkoutSetItem) => void;
  removeSetItem: (setId: string) => void;
  finishWorkout: () => void;
  discardWorkout: () => void;
  setRestTimer: (durationSeconds: number) => void;
  clearRestTimer: () => void;
  setLastSyncedAt: (timestamp: number) => void;
  setActivePRSetIds: (setIds: string[]) => void;
  queuePendingMutation: (mutation: PendingWorkoutMutation) => void;
  clearPendingMutation: (mutationId?: string) => void;
  setSyncConflict: (conflict: WorkoutSyncConflict | null) => void;
  resolveConflictWithServer: () => void;
  clearPersistenceWarning: () => void;

  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  addExercise: (exercise: WorkoutExercise) => void;
  removeExercise: (exerciseId: string) => void;
}

export function selectPersistedWorkoutState(state: WorkoutState) {
  return {
    activeWorkout: state.activeWorkout,
    startedAt: state.startedAt,
    restEndTime: state.restEndTime,
    lastSyncedAt: state.lastSyncedAt,
    sessionRevision: state.sessionRevision,
    pendingMutation: state.pendingMutation,
    syncConflict: state.syncConflict,
  };
}

const browserStorage: StateStorage = {
  getItem(name) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(name);
  },
  setItem(name, value) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(name, value);
  },
  removeItem(name) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(name);
  },
};

let deferredPersistenceWarning: string | null = null;
let reportPersistenceWarning = (message: string) => {
  deferredPersistenceWarning = message;
};

const safeWorkoutStorage = createSafeStateStorage(browserStorage, (message) => {
  reportPersistenceWarning(message);
});

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      activeWorkout: null,
      isModalOpen: false,
      startedAt: null,
      restEndTime: null,
      lastSyncedAt: null,
      activePRSetIds: [],
      sessionRevision: 0,
      pendingMutation: null,
      syncConflict: null,
      persistenceWarning: null,

      startWorkout: (workout) => {
        const startTime = workout.startedAt || Date.now();
        const initializedWorkout: Workout = {
          ...workout,
          status: 'IN_PROGRESS',
          startedAt: startTime,
          sets: workout.sets || [],
          exercises: workout.exercises || [],
        };

        set({
          activeWorkout: initializedWorkout,
          startedAt: startTime,
          isModalOpen: true,
          restEndTime: null,
          lastSyncedAt: null,
          activePRSetIds: [],
          sessionRevision: 0,
          pendingMutation: null,
          syncConflict: null,
        });
      },

      openWorkoutModal: () => set({ isModalOpen: true }),
      closeWorkoutModal: () => set({ isModalOpen: false }),

      updateActiveWorkout: (workoutOrUpdater) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const updated = typeof workoutOrUpdater === 'function'
            ? workoutOrUpdater(state.activeWorkout)
            : { ...state.activeWorkout, ...workoutOrUpdater };
          return {
            activeWorkout: updated,
            sessionRevision: state.sessionRevision + 1,
          };
        });
      },

      applyAuthoritativeWorkout: (workout, capturedRevision) => {
        set((state) => {
          if (!state.activeWorkout || state.activeWorkout.id !== workout.id) return state;
          return {
            activeWorkout: reconcileAuthoritativeWorkout(
              state.activeWorkout,
              workout,
              capturedRevision,
              state.sessionRevision
            ),
          };
        });
      },

      updateSetItem: (setId, updates) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: currentSets.map(s => s.id === setId ? { ...s, ...updates } : s),
            },
            sessionRevision: state.sessionRevision + 1,
          };
        });
      },

      addSetItem: (newItem) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: [...(state.activeWorkout.sets || []), newItem],
            },
            sessionRevision: state.sessionRevision + 1,
          };
        });
      },

      removeSetItem: (setId) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: (state.activeWorkout.sets || []).filter(s => s.id !== setId),
            },
            sessionRevision: state.sessionRevision + 1,
          };
        });
      },

      finishWorkout: () => {
        set({
          activeWorkout: null,
          isModalOpen: false,
          startedAt: null,
          restEndTime: null,
          lastSyncedAt: null,
          activePRSetIds: [],
          sessionRevision: 0,
          pendingMutation: null,
          syncConflict: null,
        });
      },

      discardWorkout: () => {
        set({
          activeWorkout: null,
          isModalOpen: false,
          startedAt: null,
          restEndTime: null,
          lastSyncedAt: null,
          activePRSetIds: [],
          sessionRevision: 0,
          pendingMutation: null,
          syncConflict: null,
        });
      },

      setRestTimer: (durationSeconds) => set({ restEndTime: Date.now() + durationSeconds * 1000 }),
      clearRestTimer: () => set({ restEndTime: null }),
      setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),
      setActivePRSetIds: (setIds) => set({ activePRSetIds: setIds }),

      queuePendingMutation: (mutation) => set({ pendingMutation: mutation }),
      clearPendingMutation: (mutationId) => set((state) => {
        if (mutationId && state.pendingMutation?.mutationId !== mutationId) return state;
        return { pendingMutation: null };
      }),
      setSyncConflict: (conflict) => set({ syncConflict: conflict }),
      resolveConflictWithServer: () => set((state) => {
        if (!state.syncConflict) return state;
        return {
          activeWorkout: state.syncConflict.serverWorkout,
          sessionRevision: 0,
          pendingMutation: null,
          syncConflict: null,
          lastSyncedAt: Date.now(),
        };
      }),
      clearPersistenceWarning: () => set({ persistenceWarning: null }),

      updateSet: (exerciseId, setId, updates) => set((state) => {
        if (!state.activeWorkout) return state;
        const exercises = (state.activeWorkout.exercises || []).map(ex => {
          if (ex.id !== exerciseId) return ex;
          return {
            ...ex,
            sets: ex.sets.map(s => s.id === setId ? { ...s, ...updates } : s),
          };
        });
        return {
          activeWorkout: { ...state.activeWorkout, exercises },
          sessionRevision: state.sessionRevision + 1,
        };
      }),

      addSet: (exerciseId, newSet) => set((state) => {
        if (!state.activeWorkout) return state;
        const exercises = (state.activeWorkout.exercises || []).map(ex =>
          ex.id === exerciseId ? { ...ex, sets: [...ex.sets, newSet] } : ex
        );
        return {
          activeWorkout: { ...state.activeWorkout, exercises },
          sessionRevision: state.sessionRevision + 1,
        };
      }),

      removeSet: (exerciseId, setId) => set((state) => {
        if (!state.activeWorkout) return state;
        const exercises = (state.activeWorkout.exercises || []).map(ex =>
          ex.id === exerciseId ? { ...ex, sets: ex.sets.filter(s => s.id !== setId) } : ex
        );
        return {
          activeWorkout: { ...state.activeWorkout, exercises },
          sessionRevision: state.sessionRevision + 1,
        };
      }),

      addExercise: (exercise) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exists = currentExercises.some(e =>
          e.id === exercise.id ||
          e.exerciseId === exercise.exerciseId ||
          (e as any).name === (exercise as any).name
        );
        if (exists) return state;

        return {
          activeWorkout: {
            ...state.activeWorkout,
            exercises: [...currentExercises, exercise],
          },
          sessionRevision: state.sessionRevision + 1,
        };
      }),

      removeExercise: (exerciseId) => set((state) => {
        if (!state.activeWorkout) return state;
        return {
          activeWorkout: {
            ...state.activeWorkout,
            exercises: (state.activeWorkout.exercises || []).filter(ex => ex.id !== exerciseId),
          },
          sessionRevision: state.sessionRevision + 1,
        };
      }),
    }),
    {
      name: 'forge-active-workout-v2',
      storage: createJSONStorage(() => safeWorkoutStorage),
      partialize: selectPersistedWorkoutState,
    }
  )
);

reportPersistenceWarning = (message) => {
  useWorkoutStore.setState({ persistenceWarning: message });
};
if (deferredPersistenceWarning) {
  useWorkoutStore.setState({ persistenceWarning: deferredPersistenceWarning });
  deferredPersistenceWarning = null;
}

export function calculateEpley1RM(weight: number, reps: number): number {
  if (typeof weight !== 'number' || isNaN(weight) || weight <= 0) return 0;
  if (typeof reps !== 'number' || isNaN(reps) || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round((weight * (1 + reps / 30)) * 10) / 10;
}
