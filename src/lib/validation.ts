import { Workout, WorkoutSetItem, WorkoutExercise, WorkoutSet, Proposal } from '../types';

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
    id: typeof set.id === 'string' && set.id.trim() ? set.id.trim() : `s_${index + 1}`,
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

/**
 * Validates a single nested set within a workout exercise.
 * Enforces physiological bounds, strict types (booleans as booleans, finite numbers),
 * and eliminates unexpected arbitrary/prototype fields.
 */
export function validateWorkoutExerciseSet(set: any, sIdx: number = 0, eIdx: number = 0): WorkoutSet {
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: expected an object`);
  }

  // Reject prototype-style injection attempts
  for (const key of Object.keys(set)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: forbidden prototype key "${key}"`);
    }
  }

  let id = `s_${eIdx + 1}_${sIdx + 1}`;
  if (set.id !== undefined && set.id !== null) {
    if (typeof set.id !== 'string' || !set.id.trim()) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: set id must be a non-empty string`);
    }
    if (set.id.length > 128) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: set id cannot exceed 128 characters`);
    }
    id = set.id.trim();
  }

  if (typeof set.weight !== 'number' || !isValidWeight(set.weight)) {
    throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: weight must be a finite number between 0 and 1000kg (got ${set.weight})`);
  }

  if (typeof set.reps !== 'number' || !isValidReps(set.reps)) {
    throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: reps must be an integer between 1 and 200 (got ${set.reps})`);
  }

  if (typeof set.completed !== 'boolean') {
    throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: completed must be a boolean`);
  }

  const validated: WorkoutSet = {
    id,
    weight: set.weight,
    reps: set.reps,
    completed: set.completed
  };

  if (set.targetWeight !== undefined && set.targetWeight !== null) {
    if (typeof set.targetWeight !== 'number' || !isValidWeight(set.targetWeight)) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: targetWeight must be a finite number between 0 and 1000kg`);
    }
    validated.targetWeight = set.targetWeight;
  }

  if (set.targetReps !== undefined && set.targetReps !== null) {
    if (typeof set.targetReps !== 'number' || !isValidReps(set.targetReps)) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: targetReps must be an integer between 1 and 200`);
    }
    validated.targetReps = set.targetReps;
  }

  if (set.rir !== undefined && set.rir !== null && set.rir !== '') {
    if (typeof set.rir !== 'number' || !isValidRir(set.rir)) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: RIR must be a finite number between 0 and 10`);
    }
    validated.rir = set.rir;
  }

  if (set.rpe !== undefined && set.rpe !== null && set.rpe !== '') {
    if (typeof set.rpe !== 'number' || !isValidRpe(set.rpe)) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: RPE must be a finite number between 1 and 10`);
    }
    validated.rpe = set.rpe;
  }

  if (set.notes !== undefined && set.notes !== null) {
    if (typeof set.notes !== 'string') {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: notes must be a string`);
    }
    validated.notes = set.notes.slice(0, 500);
  }

  if (set.setType !== undefined && set.setType !== null) {
    const allowed = ['N', 'W', 'D', 'F', 'normal'];
    if (!allowed.includes(set.setType)) {
      throw new Error(`Invalid nested set at exercise ${eIdx}, set ${sIdx}: setType must be one of ${allowed.join(', ')}`);
    }
    validated.setType = set.setType;
  }

  return validated;
}

/**
 * Validates a single nested exercise within a workout.
 * Enforces field presence, size bounds, and validates all nested sets.
 */
export function validateWorkoutExercise(exercise: any, index: number = 0): WorkoutExercise {
  if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) {
    throw new Error(`Invalid nested exercise at index ${index}: expected an object`);
  }

  // Reject prototype-style injection attempts
  for (const key of Object.keys(exercise)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Invalid nested exercise at index ${index}: forbidden prototype key "${key}"`);
    }
  }

  if (typeof exercise.exerciseId !== 'string' || !exercise.exerciseId.trim()) {
    throw new Error(`Invalid nested exercise at index ${index}: exerciseId is required`);
  }
  if (exercise.exerciseId.length > 128) {
    throw new Error(`Invalid nested exercise at index ${index}: exerciseId cannot exceed 128 characters`);
  }

  let id = `ex_${index + 1}`;
  if (exercise.id !== undefined && exercise.id !== null) {
    if (typeof exercise.id !== 'string' || !exercise.id.trim()) {
      throw new Error(`Invalid nested exercise at index ${index}: exercise id must be a non-empty string`);
    }
    if (exercise.id.length > 128) {
      throw new Error(`Invalid nested exercise at index ${index}: exercise id cannot exceed 128 characters`);
    }
    id = exercise.id.trim();
  }

  if (!Array.isArray(exercise.sets)) {
    throw new Error(`Invalid nested exercise at index ${index}: sets must be an array`);
  }

  const validatedSets = exercise.sets.map((s: any, sIdx: number) => validateWorkoutExerciseSet(s, sIdx, index));

  const validated: WorkoutExercise = {
    id,
    exerciseId: exercise.exerciseId.trim(),
    sets: validatedSets
  };

  if (exercise.name !== undefined && exercise.name !== null) {
    if (typeof exercise.name !== 'string') {
      throw new Error(`Invalid nested exercise at index ${index}: name must be a string`);
    }
    validated.name = exercise.name.slice(0, 200);
  }

  if (exercise.category !== undefined && exercise.category !== null) {
    if (typeof exercise.category !== 'string') {
      throw new Error(`Invalid nested exercise at index ${index}: category must be a string`);
    }
    validated.category = exercise.category.slice(0, 100);
  }

  if (exercise.notes !== undefined && exercise.notes !== null) {
    if (typeof exercise.notes !== 'string') {
      throw new Error(`Invalid nested exercise at index ${index}: notes must be a string`);
    }
    validated.notes = exercise.notes.slice(0, 1000);
  }

  return validated;
}

export function validateWorkoutExercises(exercises: any): WorkoutExercise[] {
  if (!Array.isArray(exercises)) {
    throw new Error('Workout exercises must be an array');
  }
  return exercises.map((ex, idx) => validateWorkoutExercise(ex, idx));
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

  if (clean.exercises !== undefined && clean.exercises !== null) {
    result.exercises = validateWorkoutExercises(clean.exercises);
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

/**
 * Validates a complete Workout entity against authoritative schema invariants.
 * Rejects malformed structures, ensures all set metrics are within valid physiological bounds,
 * and eliminates arbitrary/injected fields.
 */
export function validateCompleteWorkout(workout: any): Workout {
  if (!workout || typeof workout !== 'object' || Array.isArray(workout)) {
    throw new Error('Workout must be a valid object');
  }

  const id = typeof workout.id === 'string' ? workout.id.trim() : '';
  if (!id) {
    throw new Error('Workout id is required');
  }
  if (id.length > 128) {
    throw new Error('Workout id cannot exceed 128 characters');
  }

  const userId = typeof workout.userId === 'string' ? workout.userId.trim() : '';
  if (!userId) {
    throw new Error('Workout userId is required');
  }
  if (userId.length > 128) {
    throw new Error('Workout userId cannot exceed 128 characters');
  }

  const title = typeof workout.title === 'string' ? workout.title.trim() : '';
  if (!title) {
    throw new Error('Workout title must be a non-empty string');
  }
  if (title.length > 200) {
    throw new Error('Workout title cannot exceed 200 characters');
  }

  if (typeof workout.scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(workout.scheduledDate)) {
    throw new Error('Workout scheduledDate must be a valid date string (YYYY-MM-DD)');
  }

  const validStatuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'planned', 'in-progress', 'completed', 'skipped'];
  if (!workout.status || !validStatuses.includes(String(workout.status))) {
    throw new Error(`Invalid workout status: ${workout.status}`);
  }

  const version = Number(workout.version);
  if (!isFiniteNumber(version) || !Number.isInteger(version) || version < 1) {
    throw new Error('Workout version must be a positive integer');
  }

  // Authoritative set validation (bounds on weight, reps, RIR, RPE)
  const sets = validateWorkoutSets(workout.sets || []);

  const result: Workout = {
    id,
    userId,
    title,
    scheduledDate: workout.scheduledDate.slice(0, 10),
    status: String(workout.status).toUpperCase() as any,
    version,
    sets,
    updatedAt: typeof workout.updatedAt === 'string' ? workout.updatedAt : new Date().toISOString()
  };

  if (typeof workout.notes === 'string') {
    result.notes = workout.notes.slice(0, 2000);
  }

  if (workout.exerciseNotes && typeof workout.exerciseNotes === 'object' && !Array.isArray(workout.exerciseNotes)) {
    result.exerciseNotes = { ...workout.exerciseNotes };
  }

  if (workout.exercises !== undefined && workout.exercises !== null) {
    result.exercises = validateWorkoutExercises(workout.exercises);
  }

  if (isFiniteNumber(workout.duration) && workout.duration >= 0) {
    result.duration = workout.duration;
  }

  if (isFiniteNumber(workout.volume) && workout.volume >= 0) {
    result.volume = workout.volume;
  }

  if (isFiniteNumber(workout.totalVolume) && workout.totalVolume >= 0) {
    result.totalVolume = workout.totalVolume;
  }

  if (typeof workout.planId === 'string' && workout.planId.trim()) {
    result.planId = workout.planId.trim();
  }

  if (typeof workout.createdAt === 'string') {
    result.createdAt = workout.createdAt;
  }

  if (isFiniteNumber(workout.startedAt)) {
    result.startedAt = workout.startedAt;
  }

  if (isFiniteNumber(workout.completedAt)) {
    result.completedAt = workout.completedAt;
  }

  return result;
}

export interface DeleteCreationRollback {
  action: 'DELETE';
  targetEntityId: string;
}

export type RollbackValidationResult = (Workout & { action?: 'RESTORE' }) | DeleteCreationRollback;

/**
 * Authoritative boundary validation for workout rollback (P0-4, P0-5, P0-6, Phase 0.75).
 * Enforces cross-tenant isolation, references to target workout, contiguity,
 * safe creation rollback semantics, schema validation of inverseDelta,
 * and complete resulting workout invariant checks.
 */
export function executeRollbackValidation(
  authenticatedUid: string,
  workoutId: string,
  workoutData: any,
  auditLogData: any
): RollbackValidationResult {
  if (!authenticatedUid || typeof authenticatedUid !== 'string') {
    throw new Error("UNAUTHORIZED");
  }

  if (!workoutId || typeof workoutId !== 'string') {
    throw new Error("Workout ID is required");
  }

  if (!workoutData || typeof workoutData !== 'object') {
    throw new Error("NOT_FOUND");
  }

  // P0-5 & P0-6: Verify workout ownership against authenticated UID
  if (workoutData.userId !== authenticatedUid) {
    throw new Error("UNAUTHORIZED");
  }

  if (workoutData.id !== workoutId) {
    throw new Error("WORKOUT_ID_MISMATCH");
  }

  if (!auditLogData || typeof auditLogData !== 'object') {
    throw new Error("AUDIT_LOG_NOT_FOUND");
  }

  // P0-5: Verify audit log ownership against authenticated UID
  if (auditLogData.userId !== authenticatedUid) {
    throw new Error("UNAUTHORIZED");
  }

  // P0-4 & P0-6: Verify audit log targets the requested workout
  if (auditLogData.targetEntityId !== workoutId) {
    throw new Error("INVALID_AUDIT_LOG_TARGET: Audit log does not belong to the requested workout");
  }

  if (auditLogData.targetEntityType && auditLogData.targetEntityType !== 'WORKOUT') {
    throw new Error("INVALID_AUDIT_LOG_TYPE: Target entity is not a workout");
  }

  // Contiguity check: live workout must be at log.resultVersion
  if (workoutData.version !== auditLogData.resultVersion) {
    throw new Error(`NON_CONTIGUOUS:Workout is at v${workoutData?.version}, but mutation resulted in v${auditLogData?.resultVersion}`);
  }

  if (typeof auditLogData.baseVersion !== 'number' || auditLogData.baseVersion < 0) {
    throw new Error("INVALID_ROLLBACK_TARGET: Missing or invalid baseVersion in audit log");
  }

  // P0-4: Validate inverseDelta using the authoritative workout updates schema
  if (!auditLogData.inverseDelta || typeof auditLogData.inverseDelta !== 'object') {
    throw new Error("INVALID_INVERSE_DELTA: inverseDelta must be an object");
  }

  // Check deletion / creation rollback semantics (Phase 0.75 - Part 1)
  const hasDeletedFlag = auditLogData.inverseDelta.deleted === true;
  const deltaKeys = Object.keys(auditLogData.inverseDelta);

  if (hasDeletedFlag) {
    // PART 1B: Reject structurally ambiguous combinations (e.g. { deleted: true, sets: [...] })
    if (deltaKeys.length > 1) {
      throw new Error("STRUCTURALLY_AMBIGUOUS_INVERSE_DELTA: Cannot combine deleted=true with other workout state fields");
    }

    // PART 1A: Only legitimate server-generated creation audit entries may trigger creation rollback
    const isAuthoritativeCreation =
      (auditLogData.action === 'CREATE' || auditLogData.mutationType === 'CREATE_WORKOUT') &&
      auditLogData.baseVersion === 0 &&
      auditLogData.resultVersion === 1;

    if (!isAuthoritativeCreation) {
      throw new Error("FORGED_DELETION_AUDIT_LOG: Audit record with deleted=true is not a legitimate server-generated creation log");
    }

    return {
      action: 'DELETE',
      targetEntityId: workoutId
    };
  }

  // If action is CREATE, it MUST have inverseDelta.deleted === true
  if (auditLogData.action === 'CREATE' || auditLogData.mutationType === 'CREATE_WORKOUT') {
    throw new Error("STRUCTURALLY_AMBIGUOUS_AUDIT_LOG: Creation audit entry must have inverseDelta with deleted=true");
  }

  // If inverseDelta has deleted defined as false or any other value, reject ambiguity
  if ('deleted' in auditLogData.inverseDelta) {
    throw new Error("STRUCTURALLY_AMBIGUOUS_INVERSE_DELTA: Update rollback cannot contain deleted flag");
  }

  const validatedDelta = validateWorkoutUpdates(auditLogData.inverseDelta);

  const nextVersion = (workoutData.version || 0) + 1;

  // Construct candidate restored workout using strictly explicit field mapping
  // Immutable fields: id, userId (from authenticatedUid), version, createdAt
  const candidateRestored: Record<string, any> = {
    id: workoutData.id,
    userId: authenticatedUid, // Strictly authoritative identity
    title: validatedDelta.title !== undefined ? validatedDelta.title : workoutData.title,
    scheduledDate: validatedDelta.scheduledDate !== undefined ? validatedDelta.scheduledDate : workoutData.scheduledDate,
    status: validatedDelta.status !== undefined ? validatedDelta.status : (workoutData.status || 'PLANNED'),
    sets: validatedDelta.sets !== undefined ? validatedDelta.sets : (workoutData.sets || []),
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    createdAt: workoutData.createdAt || workoutData.updatedAt || new Date().toISOString(),
  };

  if (validatedDelta.exercises !== undefined) {
    candidateRestored.exercises = validatedDelta.exercises;
  } else if (workoutData.exercises !== undefined) {
    candidateRestored.exercises = workoutData.exercises;
  }

  if (validatedDelta.notes !== undefined) {
    candidateRestored.notes = validatedDelta.notes;
  } else if (workoutData.notes !== undefined) {
    candidateRestored.notes = workoutData.notes;
  }

  if (validatedDelta.exerciseNotes !== undefined) {
    candidateRestored.exerciseNotes = validatedDelta.exerciseNotes;
  } else if (workoutData.exerciseNotes !== undefined) {
    candidateRestored.exerciseNotes = workoutData.exerciseNotes;
  }

  if (validatedDelta.completedAt !== undefined) {
    candidateRestored.completedAt = validatedDelta.completedAt;
  } else if (workoutData.completedAt !== undefined) {
    candidateRestored.completedAt = workoutData.completedAt;
  }

  if (validatedDelta.startedAt !== undefined) {
    candidateRestored.startedAt = validatedDelta.startedAt;
  } else if (workoutData.startedAt !== undefined) {
    candidateRestored.startedAt = workoutData.startedAt;
  }

  if (validatedDelta.totalVolume !== undefined) {
    candidateRestored.totalVolume = validatedDelta.totalVolume;
  } else if (workoutData.totalVolume !== undefined) {
    candidateRestored.totalVolume = workoutData.totalVolume;
  }

  if (validatedDelta.volume !== undefined) {
    candidateRestored.volume = validatedDelta.volume;
  } else if (workoutData.volume !== undefined) {
    candidateRestored.volume = workoutData.volume;
  }

  if (validatedDelta.duration !== undefined) {
    candidateRestored.duration = validatedDelta.duration;
  } else if (workoutData.duration !== undefined) {
    candidateRestored.duration = workoutData.duration;
  }

  if (workoutData.planId) {
    candidateRestored.planId = workoutData.planId;
  }

  // Validate the COMPLETE resulting workout against authoritative invariants
  const completeWorkout = validateCompleteWorkout(candidateRestored);
  return Object.assign(completeWorkout, { action: 'RESTORE' as const });
}

