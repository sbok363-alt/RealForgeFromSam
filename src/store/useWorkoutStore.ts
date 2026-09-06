import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Workout, WorkoutExercise, WorkoutSet, WorkoutSetItem } from '../types';

export interface WorkoutState {
  activeWorkout: Workout | null;
  isModalOpen: boolean;
  startedAt: number | null;
  restEndTime: number | null;
  lastSyncedAt: number | null;
  activePRSetIds: string[];
  
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

  // Backward compatibility methods for exercise-based schema
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  addExercise: (exercise: WorkoutExercise) => void;
  removeExercise: (exerciseId: string) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      activeWorkout: null,
      isModalOpen: false,
      startedAt: null,
      restEndTime: null,
      lastSyncedAt: null,
      activePRSetIds: [],

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
          activePRSetIds: []
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
          return { activeWorkout: updated };
        });
      },

      updateSetItem: (setId, updates) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          const updatedSets = currentSets.map(s => s.id === setId ? { ...s, ...updates } : s);
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: updatedSets
            }
          };
        });
      },

      addSetItem: (newItem) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: [...currentSets, newItem]
            }
          };
        });
      },

      removeSetItem: (setId) => {
        set((state) => {
          if (!state.activeWorkout) return state;
          const currentSets = state.activeWorkout.sets || [];
          return {
            activeWorkout: {
              ...state.activeWorkout,
              sets: currentSets.filter(s => s.id !== setId)
            }
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
          activePRSetIds: []
        });
      },

      discardWorkout: () => {
        set({
          activeWorkout: null,
          isModalOpen: false,
          startedAt: null,
          restEndTime: null,
          lastSyncedAt: null,
          activePRSetIds: []
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

      setActivePRSetIds: (setIds) => {
        set({ activePRSetIds: setIds });
      },

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
        return { activeWorkout: { ...state.activeWorkout, exercises } };
      }),

      addSet: (exerciseId, newSet) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exercises = currentExercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          return { ...ex, sets: [...ex.sets, newSet] };
        });
        return { activeWorkout: { ...state.activeWorkout, exercises } };
      }),

      removeSet: (exerciseId, setId) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        const exercises = currentExercises.map(ex => {
          if (ex.id !== exerciseId) return ex;
          return { ...ex, sets: ex.sets.filter(s => s.id !== setId) };
        });
        return { activeWorkout: { ...state.activeWorkout, exercises } };
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
        };
      }),

      removeExercise: (exerciseId) => set((state) => {
        if (!state.activeWorkout) return state;
        const currentExercises = state.activeWorkout.exercises || [];
        return { 
          activeWorkout: { 
            ...state.activeWorkout, 
            exercises: currentExercises.filter(ex => ex.id !== exerciseId) 
          } 
        };
      })
    }),
    {
      name: 'forge-active-workout-v2',
      partialize: (state) => ({
        activeWorkout: state.activeWorkout,
        startedAt: state.startedAt,
        restEndTime: state.restEndTime,
        lastSyncedAt: state.lastSyncedAt,
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
