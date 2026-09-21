import { Workout, WorkoutExercise, WorkoutSet, WorkoutSetItem } from '../types';

export interface WorkoutCompletionPayload {
  updates: Partial<Workout>;
  duration: number;
  totalVolume: number;
}

export function isWorkingSetType(
  setType?: WorkoutSet['setType'] | WorkoutSetItem['setType']
): boolean {
  return setType !== 'W';
}

export function projectCompletedWorkingExercises(workout: Workout): WorkoutExercise[] {
  if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) {
    return [];
  }

  return workout.exercises
    .map((exercise) => ({
      ...exercise,
      sets: exercise.sets.filter(
        (set) => set.completed === true && isWorkingSetType(set.setType)
      ),
    }))
    .filter((exercise) => exercise.sets.length > 0);
}

export function projectCompletedWorkingSets(workout: Workout): WorkoutSetItem[] {
  if (Array.isArray(workout.exercises) && workout.exercises.length > 0) {
    return projectCompletedWorkingExercises(workout).flatMap((exercise) =>
      exercise.sets.map((set) => ({
        id: set.id,
        exercise: exercise.exerciseId,
        weight: set.weight,
        reps: set.reps,
        rir: set.rir,
        rpe: set.rpe,
        notes: set.notes,
        completed: true,
        setType: set.setType === 'normal' ? 'N' : set.setType,
      }))
    );
  }

  return (workout.sets || []).filter(
    (set) => set.completed === true && isWorkingSetType(set.setType)
  );
}

export function buildCompletionPayload(
  workout: Workout,
  completedAt: number,
  durationSeconds: number
): WorkoutCompletionPayload {
  const exercises = projectCompletedWorkingExercises(workout);
  const sets = projectCompletedWorkingSets(workout);
  const totalVolume = sets.reduce(
    (sum, set) => sum + set.weight * set.reps,
    0
  );

  return {
    updates: {
      title: workout.title || workout.name || 'Completed Workout',
      scheduledDate:
        workout.scheduledDate || new Date(completedAt).toISOString().split('T')[0],
      status: 'COMPLETED',
      sets,
      ...(workout.exercises?.length ? { exercises } : {}),
      completedAt,
      totalVolume,
    },
    duration: Math.max(0, Math.floor(durationSeconds)),
    totalVolume,
  };
}
