import { Workout, WorkoutSetItem, Proposal } from '../types';

export function isFiniteNumber(val: any): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

export function isValidWeight(weight: any): boolean {
  return isFiniteNumber(weight) && weight >= 0 && weight <= 1000;
}

export function isValidReps(reps: any): boolean {
  return isFiniteNumber(reps) && Number.isInteger(reps) && reps >= 1 && reps <= 200;
}

export function isValidRir(rir: any): boolean {
  if (rir === undefined || rir === null) return true;
  return isFiniteNumber(rir) && rir >= 0 && rir <= 10;
}

export function isValidRpe(rpe: any): boolean {
  if (rpe === undefined || rpe === null) return true;
  return isFiniteNumber(rpe) && rpe >= 1 && rpe <= 10;
}

export const IMMUTABLE_FIELDS = ['id', 'userId', 'version', 'createdAt'] as const;

export function stripImmutableFields<T extends Record<string, any>>(obj: T): Omit<T, 'id' | 'userId' | 'version' | 'createdAt'> {
  if (!obj || typeof obj !== 'object') return {} as any;
  const copy: any = { ...obj };
  for (const field of IMMUTABLE_FIELDS) {
    delete copy[field];
  }
  return copy;
}

export function validateWorkoutSet(set: any, index: number = 0): WorkoutSetItem {
  if (!set || typeof set !== 'object') {
    throw new Error(`Invalid set at index ${index}: expected an object`);
  }

  const exercise = typeof set.exercise === 'string' ? set.exercise.trim() : '';
  if (!exercise) {
    throw new Error(`Invalid set at index ${index}: exercise name is required`);
  }

  const weight = Number(set.weight);
  if (!isValidWeight(weight)) {
    throw new Error(`Invalid set at index ${index}: weight must be a finite number between 0 and 1000kg (got ${set.weight})`);
  }

  const reps = Number(set.reps);
  if (!isValidReps(reps)) {
    throw new Error(`Invalid set at index ${index}: reps must be an integer between 1 and 200 (got ${set.reps})`);
  }

  const validated: WorkoutSetItem = {
    id: typeof set.id === 'string' && set.id.trim() ? set.id.trim() : `s_${index + 1}_${Math.random().toString(36).slice(2, 7)}`,
    exercise,
    weight,
    reps,
    completed: Boolean(set.completed)
  };

  if (set.rir !== undefined && set.rir !== null && set.rir !== '') {
    const rirNum = Number(set.rir);
    if (!isValidRir(rirNum)) {
      throw new Error(`Invalid set at index ${index}: RIR must be between 0 and 10`);
    }
    validated.rir = rirNum;
  }

  if (set.rpe !== undefined && set.rpe !== null && set.rpe !== '') {
    const rpeNum = Number(set.rpe);
    if (!isValidRpe(rpeNum)) {
      throw new Error(`Invalid set at index ${index}: RPE must be between 1 and 10`);
    }
    validated.rpe = rpeNum;
  }

  if (typeof set.notes === 'string') {
    validated.notes = set.notes.slice(0, 500);
  }

  if (set.setType && ['N', 'W', 'D', 'F'].includes(set.setType)) {
    validated.setType = set.setType;
  }

  return validated;
}

export function validateWorkoutSets(sets: any): WorkoutSetItem[] {
  if (!Array.isArray(sets)) {
    throw new Error('Sets must be an array');
  }
  return sets.map((s, idx) => validateWorkoutSet(s, idx));
}

export function validateWorkoutUpdates(updates: any): Partial<Workout> {
  if (!updates || typeof updates !== 'object') {
    throw new Error('Workout updates must be an object');
  }

  // Strip immutable fields
  const clean = stripImmutableFields(updates);
  const result: Partial<Workout> = {};

  if (clean.title !== undefined) {
    if (typeof clean.title !== 'string' || clean.title.trim().length === 0) {
      throw new Error('Workout title must be a non-empty string');
    }
    result.title = clean.title.trim().slice(0, 200);
  }

  if (clean.scheduledDate !== undefined) {
    if (typeof clean.scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(clean.scheduledDate)) {
      throw new Error('Workout scheduledDate must be a valid date string (YYYY-MM-DD)');
    }
    result.scheduledDate = clean.scheduledDate.slice(0, 10);
  }

  if (clean.status !== undefined) {
    const validStatuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'];
    const upper = String(clean.status).toUpperCase();
    if (!validStatuses.includes(upper)) {
      throw new Error(`Invalid workout status: ${clean.status}`);
    }
    result.status = upper as any;
  }

  if (clean.sets !== undefined) {
    result.sets = validateWorkoutSets(clean.sets);
  }

  if (clean.exercises !== undefined && Array.isArray(clean.exercises)) {
    result.exercises = clean.exercises;
  }

  if (clean.exerciseNotes !== undefined && typeof clean.exerciseNotes === 'object') {
    result.exerciseNotes = clean.exerciseNotes;
  }

  if (clean.completedAt !== undefined) {
    if (clean.completedAt !== null && !isFiniteNumber(clean.completedAt)) {
      throw new Error('completedAt must be a valid timestamp number or null');
    }
    result.completedAt = clean.completedAt;
  }

  if (clean.startedAt !== undefined) {
    if (clean.startedAt !== null && !isFiniteNumber(clean.startedAt)) {
      throw new Error('startedAt must be a valid timestamp number or null');
    }
    result.startedAt = clean.startedAt;
  }

  return result;
}

export function validateProposalArgs(args: any): {
  targetEntityId: string;
  baseVersion: number;
  summary: string;
  afterState: {
    title: string;
    scheduledDate: string;
    status?: string;
    sets: WorkoutSetItem[];
  };
} {
  if (!args || typeof args !== 'object') {
    throw new Error('Proposal arguments must be an object');
  }

  const targetEntityId = typeof args.targetEntityId === 'string' ? args.targetEntityId.trim() : '';
  if (!targetEntityId) {
    throw new Error('targetEntityId is required for proposal');
  }

  const baseVersion = Number(args.baseVersion);
  if (!isFiniteNumber(baseVersion) || baseVersion < 0 || !Number.isInteger(baseVersion)) {
    throw new Error('baseVersion must be a non-negative integer');
  }

  const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
  if (!summary) {
    throw new Error('summary is required for proposal');
  }

  if (!args.afterState || typeof args.afterState !== 'object') {
    throw new Error('afterState is required for proposal');
  }

  const cleanAfterState = stripImmutableFields(args.afterState);

  const title = typeof cleanAfterState.title === 'string' && cleanAfterState.title.trim()
    ? cleanAfterState.title.trim()
    : 'Updated Workout';

  const scheduledDate = typeof cleanAfterState.scheduledDate === 'string' && cleanAfterState.scheduledDate.trim()
    ? cleanAfterState.scheduledDate.trim()
    : new Date().toISOString().split('T')[0];

  const sets = validateWorkoutSets(cleanAfterState.sets || []);

  return {
    targetEntityId,
    baseVersion,
    summary: summary.slice(0, 500),
    afterState: {
      title: title.slice(0, 200),
      scheduledDate: scheduledDate.slice(0, 10),
      status: cleanAfterState.status ? String(cleanAfterState.status).toUpperCase() : undefined,
      sets
    }
  };
}

export function validatePlanArgs(args: any): {
  name: string;
  goal?: string;
  days: Array<{
    name: string;
    exercises: Array<{
      exerciseId: string;
      targetSets: number;
      targetRepsMin: number;
      targetRepsMax: number;
    }>;
  }>;
} {
  if (!args || typeof args !== 'object') {
    throw new Error('Plan arguments must be an object');
  }

  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) {
    throw new Error('Plan name is required');
  }

  if (!Array.isArray(args.days) || args.days.length === 0) {
    throw new Error('Plan must contain at least one day in days array');
  }

  const validatedDays = args.days.map((day: any, dIdx: number) => {
    if (!day || typeof day !== 'object') {
      throw new Error(`Invalid plan day at index ${dIdx}`);
    }
    const dayName = typeof day.name === 'string' && day.name.trim() ? day.name.trim() : `Day ${dIdx + 1}`;
    if (!Array.isArray(day.exercises)) {
      throw new Error(`Plan day ${dayName} must contain an exercises array`);
    }

    const validatedExercises = day.exercises.map((ex: any, eIdx: number) => {
      if (!ex || typeof ex !== 'object') {
        throw new Error(`Invalid exercise at day ${dIdx}, index ${eIdx}`);
      }
      const exerciseId = typeof ex.exerciseId === 'string' ? ex.exerciseId.trim() : '';
      if (!exerciseId) {
        throw new Error(`exerciseId is required at day ${dIdx}, index ${eIdx}`);
      }
      const targetSets = Number(ex.targetSets);
      if (!isFiniteNumber(targetSets) || targetSets < 1 || targetSets > 20) {
        throw new Error(`targetSets must be between 1 and 20 for ${exerciseId}`);
      }
      const targetRepsMin = Number(ex.targetRepsMin);
      const targetRepsMax = Number(ex.targetRepsMax);
      if (!isFiniteNumber(targetRepsMin) || targetRepsMin < 1 || !isFiniteNumber(targetRepsMax) || targetRepsMax < targetRepsMin) {
        throw new Error(`Invalid target reps range for ${exerciseId}`);
      }

      return {
        exerciseId,
        targetSets,
        targetRepsMin,
        targetRepsMax
      };
    });

    return {
      name: dayName,
      exercises: validatedExercises
    };
  });

  return {
    name: name.slice(0, 100),
    goal: typeof args.goal === 'string' ? args.goal.trim().slice(0, 200) : undefined,
    days: validatedDays
  };
}
