import { Workout } from '../types';

export interface PreparedWorkoutStart {
  workout: Workout;
  startedAt: number;
}

/**
 * Starting a new session must never silently replace active work.
 * Callers must explicitly finish or discard the current session first.
 */
export function prepareWorkoutStart(
  activeWorkout: Workout | null,
  workout: Workout,
  now: () => number = () => Date.now()
): PreparedWorkoutStart | null {
  if (activeWorkout) return null;

  const startedAt = workout.startedAt || now();
  return {
    workout: {
      ...workout,
      status: 'IN_PROGRESS',
      startedAt,
      sets: workout.sets || [],
      exercises: workout.exercises || [],
    },
    startedAt,
  };
}
