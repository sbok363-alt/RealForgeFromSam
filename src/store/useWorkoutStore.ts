import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PendingWorkoutMutation, Workout, WorkoutExercise, WorkoutSet, WorkoutSetItem, WorkoutSyncConflict } from '../types';
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
  syncError: string | null;
  persistenceWarning: string | null;
  
  // Actions
  startWorkout: (workout: Workout) => void;
  openWorkoutModal: () => void;
  closeWorkoutModal: () => void;
  updateActiveWorkout: (workoutOrUpdater: Partial<Workout> | ((prev: Workout) => Workout)) => void;
  updateSetItem: (setId: string, updates: Partial<WorkoutSetItem>) => void;
  addSetItem: (setItem: WorkoutSetItem) => void;
  removeSetItem: (setId: string) => void;
  finishWorkout: () => void;
  discardWorkout: () => void;
  setRestTimer: (durationSeconds: number) => void;
  clearRestTimer: () => void;
  setLastSyncedAt: (timestamp: number) => void;
  setActivePRSetIds: (setIds: string[]) => void;
  queuePendingMutation: (operation: PendingWorkoutMutation) => void;
  clearPendingMutation: () => void;
  setSyncConflict: (conflict: WorkoutSyncConflict | null) => void;
  setSyncError: (message: string | null) => void;
  applyAuthoritativeWorkout: (workout: Workout) => void;
  resolveConflictWithServer: () => void;

  // Backward compatibility methods for exercise-based schema
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  addExercise: (exercise: WorkoutExercise) => void;
  removeExercise: (exerciseId: string) => void;
}

let persistenceWarningSink = (_message: string) => {};

const workoutStorage = createSafeStateStorage(
  {
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => window.localStorage.setItem(name, value),
    removeItem: (name) => window.localStorage.removeItem(name),
  },
  (message) => persistenceWarningSink(message)
);

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      activeWorkout: null,
      isModalOpen: false,
      startedAt: null,
      restEndTime: null,
      lastSyncedAt: null,
      activePRSetIds: [],
      sessionRevision: 0,
      pendingMutation: null,
      syncConflict: null,
      syncError: null,
      persistenceWarning: null,

      startWorkout: (workout) => {
        const startTime = workout.startedAt || Date.now();
        const initializedWorkout: Workout = {
          ...workout,
          status: 'IN_PROGRESS',
          startedAt: startTime,
          // Ensure both sets and exercises default strictly to empty arrays if undefined
          sets: workout.sets || [],
          exercises: workout.exercises || []
        };

        set({
          activeWorkout: initializedWorkout,
          startedAt: startTime,
          isModalOpen: true,
          restEndTime: null,
          activePRSetIds: [],
          sessionRevision: 0,
          pendingMutation: null,
          syncConflict: null,
          syncError: null
        });
      },

      openWorkoutModal: () => {
        set({ isModalOpen: true });
      },

      closeWorkoutModal: () => {
        set({ isModalOpen: false });
      },

      updateActiveWorkout: (workoutOrUpdater) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const updated = typeof workoutOrUpdater === 'function'
            ? workoutOrUpdater(state.activeWorkout)
            : { ...state.activeWorkout, ...workoutOrUpdater };
          return { activeWorkout: updated, sessionRevision: state.sessionRevision + 1 };
        });
      },

      updateSetItem: (setId, updates) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          const updatedSets = currentSets.map(s => s.id === setId ? { ...s, ...updates } : s);
          return { activeWorkout: { ...state.activeWorkout, sets: updatedSets }, sessionRevision: state.sessionRevision + 1 };
        });
      },

      addSetItem: (newItem) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          return { activeWorkout: { ...state.activeWorkout, sets: [...currentSets, newItem] }, sessionRevision: state.sessionRevision + 1 };
        });
      },

      removeSetItem: (setId) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          return { activeWorkout: { ...state.activeWorkout, sets: currentSets.filter(s => s.id !== setId) }, sessionRevision: state.sessionRevision + 1 };
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
          syncError: null
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
          syncError: null
        });
      },

      setRestTimer: (durationSeconds) => {
        set({ restEndTime: Date.now() + durationSeconds * 1000 });
      },

      clearRestTimer: () => {
        set({ restEndTime: null });
      },

      setLastSyncedAt: (timestamp) => {
        set({ lastSyncedAt: timestamp });
      },

      setActivePRSetIds: (setIds) => set({ activePRSetIds: setIds }),
      queuePendingMutation: (operation) => set({ pendingMutation: operation, syncError: null }),
      clearPendingMutation: () => set({ pendingMutation: null }),
      setSyncConflict: (conflict) => set({ syncConflict: conflict }),
      setSyncError: (message) => set({ syncError: message }),
      applyAuthoritativeWorkout: (workout) => set({ activeWorkout: workout, lastSyncedAt: Date.now(), syncError: null }),
      resolveConflictWithServer: () => set((state) => state.syncConflict ? ({
        activeWorkout: state.syncConflict.serverWorkout,
        pendingMutation: null,
        syncConflict: null,
        syncError: null,
        sessionRevision: 0,
        lastSyncedAt: Date.now(),
      }) : state),

      // Backward compatibility implementations
      updateSet: (exerciseId, setId, updates) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exercises = currentExercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          return {
            ...ex,
            sets: ex.sets.map(s => s.id === setId ? { ...s, ...updates } : s)
          };
        });
        return { activeWorkout: { ...state.activeWorkout, exercises } , sessionRevision: state.sessionRevision + 1 };
      }),

      addSet: (exerciseId, newSet) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exercises = currentExercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          return { ...ex, sets: [...ex.sets, newSet] };
        });
        return { activeWorkout: { ...state.activeWorkout, exercises }, sessionRevision: state.sessionRevision + 1 };
      }),

      removeSet: (exerciseId, setId) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exercises = currentExercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          return { ...ex, sets: ex.sets.filter(s => s.id !== setId) };
        });
        return { activeWorkout: { ...state.activeWorkout, exercises }, sessionRevision: state.sessionRevision + 1 };
      }),

      addExercise: (exercise) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        
        // Guard against duplicate exercise injection
        const exists = currentExercises.some(e => e.id === exercise.id || e.exerciseId === exercise.exerciseId || (e as any).name === (exercise as any).name);
        if (exists) return state;

        return { 
          activeWorkout: { 
            ...state.activeWorkout, 
            exercises: [...currentExercises, exercise] 
          } 
        , sessionRevision: state.sessionRevision + 1 };
      }),

      removeExercise: (exerciseId) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        return { 
          activeWorkout: { 
            ...state.activeWorkout, 
            exercises: currentExercises.filter(ex => ex.id !== exerciseId) 
          } 
        , sessionRevision: state.sessionRevision + 1 };
      })
    }),
    {
      name: 'forge-active-workout-v2',
      storage: createJSONStorage(() => workoutStorage as any),
      partialize: (state) => ({
        activeWorkout: state.activeWorkout,
        startedAt: state.startedAt,
        restEndTime: state.restEndTime,
        lastSyncedAt: state.lastSyncedAt,
        sessionRevision: state.sessionRevision,
        pendingMutation: state.pendingMutation,
        syncConflict: state.syncConflict,
        // We do NOT persist isModalOpen across reloads so the user isn't startled with a modal immediately, but the bottom bar will be visible!
      })
    }
  )
);

/**
 * Calculates Estimated 1RM using Epley's formula:
 * 1RM = Weight * (1 + Reps / 30)
 */
export function calculateEpley1RM(weight: number, reps: number): number {
  if (typeof weight !== 'number' || isNaN(weight) || weight <= 0) return 0;
  if (typeof reps !== 'number' || isNaN(reps) || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round((weight * (1 + reps / 30)) * 10) / 10;
}


persistenceWarningSink = (message: string) => {
  useWorkoutStore.setState({ persistenceWarning: message });
};
