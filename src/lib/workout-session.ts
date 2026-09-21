import { Workout, WorkoutExercise, WorkoutSet, WorkoutSetItem } from '../types';

export interface WorkoutCompletionPayload {
  updates: Partial<Workout>;
  duration: number;
  totalVolume: number;
}

export function isWorkingSetType(setType?: WorkoutSet['setType'] | WorkoutSetItem['setType']): boolean {
  return setType !== 'W';
}

export function projectCompletedWorkingExercises(workout: Workout): WorkoutExercise[] {
  if (!workout.exercises?.length) return [];

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
  if (workout.exercises?.length) {
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
  const totalVolume = sets.reduce((sum, set) => sum + set.weight * set.reps, 0);

  return {
    updates: {
      title: workout.title || workout.name || 'Completed Workout',
      scheduledDate: workout.scheduledDate,
      status: 'COMPLETED',
      completedAt,
      exercises,
      sets,
      totalVolume,
    },
    duration: Math.max(0, Math.floor(durationSeconds)),
    totalVolume,
  };
}


function normalizeExerciseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[-_\s]+/g, '');
}

export function rebuildExercisesPreservingIdentity(
  flatSets: WorkoutSetItem[],
  existingExercises: WorkoutExercise[]
): WorkoutExercise[] {
  const groups = new Map<string, WorkoutSetItem[]>();
  for (const set of flatSets) {
    const list = groups.get(set.exercise) || [];
    list.push(set);
    groups.set(set.exercise, list);
  }

  return Array.from(groups.entries()).map(([exerciseLabel, sets]) => {
    const key = normalizeExerciseKey(exerciseLabel);
    const existing = existingExercises.find((exercise) =>
      normalizeExerciseKey(exercise.exerciseId) === key ||
      (exercise.name ? normalizeExerciseKey(exercise.name) === key : false)
    );
    return {
      id: existing?.id || crypto.randomUUID(),
      exerciseId: existing?.exerciseId || exerciseLabel.toLowerCase().trim().replace(/\s+/g, '-'),
      name: existing?.name || exerciseLabel,
      category: existing?.category,
      notes: existing?.notes,
      sets: sets.map((set) => ({
        id: set.id,
        weight: set.weight,
        reps: set.reps,
        completed: set.completed === true,
        setType: set.setType,
        rir: set.rir,
        rpe: set.rpe,
        notes: set.notes,
      })),
    };
  });
}
