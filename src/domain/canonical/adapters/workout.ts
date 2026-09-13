import { z } from 'zod';
import { CalendarDateSchema, IdSchema, VersionSchema } from '../common';
import { TrainingSessionSchema, SetPerformanceSchema, type ExercisePerformance, type TrainingSession } from '../training';
import { resolveExercise } from './catalog';
import { adapt, identity, issue, LegacyInstantSchema, LegacyNumberSchema, nullableOptional, ReadScopeSchema, type AdapterIssue, type ReadScope } from './shared';

const SetInputSchema = z.object({
  id: nullableOptional(IdSchema),
  weight: LegacyNumberSchema,
  reps: LegacyNumberSchema,
  completed: nullableOptional(z.boolean()),
  setType: nullableOptional(z.enum(['N', 'W', 'D', 'F', 'normal'])),
  targetWeight: nullableOptional(LegacyNumberSchema),
  targetReps: nullableOptional(LegacyNumberSchema),
  rir: nullableOptional(LegacyNumberSchema),
  rpe: nullableOptional(LegacyNumberSchema),
  notes: nullableOptional(z.string()),
});
const FlatSetInputSchema = SetInputSchema.extend({ exercise: IdSchema });
const ExerciseInputSchema = z.object({
  id: nullableOptional(IdSchema), exerciseId: IdSchema, name: nullableOptional(IdSchema),
  notes: nullableOptional(z.string()), sets: z.array(SetInputSchema),
});
const WorkoutInputSchema = z.object({
  id: nullableOptional(IdSchema), userId: nullableOptional(IdSchema),
  title: nullableOptional(z.string()), name: nullableOptional(z.string()),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'planned', 'in-progress', 'completed', 'skipped']),
  version: VersionSchema.optional(), scheduledDate: nullableOptional(CalendarDateSchema),
  sets: z.unknown().optional(), exercises: z.unknown().optional(),
  notes: nullableOptional(z.string()), exerciseNotes: nullableOptional(z.record(z.string(), z.string())),
  planId: nullableOptional(IdSchema),
  startedAt: nullableOptional(LegacyInstantSchema), completedAt: nullableOptional(LegacyInstantSchema),
  createdAt: nullableOptional(LegacyInstantSchema), updatedAt: nullableOptional(LegacyInstantSchema),
  duration: nullableOptional(LegacyNumberSchema), volume: nullableOptional(LegacyNumberSchema), totalVolume: nullableOptional(LegacyNumberSchema),
});

type LegacySet = z.infer<typeof SetInputSchema>;
function performance(raw: LegacySet, index: number, path: string, issues: AdapterIssue[]) {
  if (!raw.id) issue(issues, `${path}.id`, 'derived_id', 'Read-only set ID derived from source position');
  if (raw.completed === undefined) issue(issues, `${path}.completed`, 'unknown_completion', 'Completion was not recorded');
  return SetPerformanceSchema.parse({
    id: raw.id ?? `legacy-set-${index}`,
    weightKg: raw.weight, reps: raw.reps,
    completion: raw.completed === undefined ? 'unknown' : raw.completed ? 'completed' : 'not_completed',
    setType: raw.setType === 'normal' ? 'N' : raw.setType ?? 'N',
    targetWeightKg: raw.targetWeight, targetReps: raw.targetReps,
    rir: raw.rir, rpe: raw.rpe, notes: raw.notes,
  });
}

export function adaptLegacyWorkout(raw: unknown, scope: ReadScope) {
  return adapt(issues => {
    const input = WorkoutInputSchema.parse(raw);
    const owner = identity(input, scope, issues);
    const nested = z.array(z.unknown()).nullish().parse(input.exercises) ?? [];
    const exercises: ExercisePerformance[] = [];
    if (nested.length > 0) {
      if (input.sets !== undefined && input.sets !== null) issue(issues, 'sets', 'nested_precedence', 'Nested exercises selected; flat mirror not merged');
      for (const [index, value] of nested.entries()) {
        const exercise = ExerciseInputSchema.parse(value);
        if (!exercise.id) issue(issues, `exercises.${index}.id`, 'derived_id', 'Read-only exercise ID derived from source position');
        exercises.push({
          id: exercise.id ?? `legacy-exercise-${index}`,
          exercise: resolveExercise(exercise.exerciseId, exercise.name ?? exercise.exerciseId),
          notes: exercise.notes ?? input.exerciseNotes?.[exercise.exerciseId],
          sets: exercise.sets.map((set, setIndex) => performance(set, setIndex, `exercises.${index}.sets.${setIndex}`, issues)),
        });
      }
    } else {
      const sets = z.array(FlatSetInputSchema).nullish().parse(input.sets) ?? [];
      // Contiguous groups preserve A/B/A ordering and avoid merging distinct blocks.
      let previousIdentifier: string | undefined;
      for (const [index, set] of sets.entries()) {
        let group = exercises[exercises.length - 1];
        if (!group || previousIdentifier !== set.exercise) {
          group = { id: `flat-exercise-${index}`, exercise: resolveExercise(set.exercise), sets: [], notes: input.exerciseNotes?.[set.exercise] };
          exercises.push(group);
        }
        group.sets.push(performance(set, index, `sets.${index}`, issues));
        previousIdentifier = set.exercise;
      }
    }
    for (const [index, exercise] of exercises.entries()) {
      if (exercise.exercise.kind === 'unresolved') issue(issues, `exercises.${index}.exercise`, 'unresolved_exercise', 'Original exercise identifier retained; no exact catalog match');
    }
    if (input.version === undefined) issue(issues, 'version', 'legacy_version', 'Missing OCC version represented as zero; never written back');
    if (input.duration !== undefined) issue(issues, 'duration', 'ambiguous_duration', 'Legacy duration retained without assuming seconds or minutes');
    const title = input.title?.trim() ? input.title : input.name?.trim() ? input.name : 'Workout';
    if (!input.title?.trim()) issue(issues, 'title', 'legacy_title', 'Title supplied from legacy name or display fallback');
    return TrainingSessionSchema.parse({
      schemaVersion: 1, ...owner, version: input.version ?? 0, title,
      status: input.status.toUpperCase().replace('-', '_'),
      scheduledDate: input.scheduledDate, exercises, notes: input.notes, planId: input.planId,
      startedAt: input.startedAt, completedAt: input.completedAt, createdAt: input.createdAt, updatedAt: input.updatedAt,
      legacy: { representation: nested.length > 0 ? 'nested' : 'flat', duration: input.duration, volume: input.volume, totalVolume: input.totalVolume },
    });
  });
}

export interface TrainingSessionReadResult {
  sessions: TrainingSession[];
  failures: { index: number; issues: AdapterIssue[] }[];
  warnings: { index: number; issues: AdapterIssue[] }[];
}
export function adaptLegacyWorkouts(records: unknown, scope: ReadScope): TrainingSessionReadResult {
  const result: TrainingSessionReadResult = { sessions: [], failures: [], warnings: [] };
  const context = ReadScopeSchema.safeParse(scope);
  if (!context.success) {
    result.failures.push({ index: -1, issues: [{ path: 'scope', code: 'invalid_scope', message: 'Expected an explicit valid read scope' }] });
    return result;
  }
  const list = z.array(z.unknown()).safeParse(records);
  if (!list.success) {
    result.failures.push({ index: -1, issues: [{ path: '', code: 'invalid_collection', message: 'Expected an array of workout records' }] });
    return result;
  }
  for (const [index, raw] of list.data.entries()) {
    const adapted = adaptLegacyWorkout(raw, context.data);
    if (adapted.success) {
      result.sessions.push(adapted.data);
      if (adapted.issues.length) result.warnings.push({ index, issues: adapted.issues });
    } else result.failures.push({ index, issues: adapted.issues });
  }
  return result;
}
