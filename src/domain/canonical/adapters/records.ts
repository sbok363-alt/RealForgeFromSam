import { z } from 'zod';
import { IdSchema, VersionSchema } from '../common';
import { ProfileSchema, PreferencesSchema, UserSchema } from '../user';
import { PlanSchema } from '../program';
import { HealthObservationSchema } from '../health';
import { resolveExercise } from './catalog';
import { adapt, identity, issue, LegacyInstantSchema, LegacyNumberSchema, nullableOptional, ReadScopeSchema, type ReadScope } from './shared';

const ProfileInputSchema = PreferencesSchema.extend({
  userId: IdSchema.optional(), name: nullableOptional(z.string()),
  onboardingCompleted: nullableOptional(z.boolean()),
  onboardingCompletedAt: nullableOptional(LegacyInstantSchema), createdAt: nullableOptional(LegacyInstantSchema),
}).strip();
export function adaptLegacyProfile(raw: unknown, scope: ReadScope) {
  return adapt(issues => {
    const input = ProfileInputSchema.parse(raw);
    const context = ReadScopeSchema.parse(scope);
    const owner = identity({ id: input.userId ?? context.userId, userId: input.userId }, context, issues);
    return ProfileSchema.parse({
      schemaVersion: 1, ...owner, name: input.name,
      preferences: PreferencesSchema.strip().parse(input),
      onboardingCompleted: input.onboardingCompleted, onboardingCompletedAt: input.onboardingCompletedAt, createdAt: input.createdAt,
    });
  });
}
export function adaptAuthUser(raw: unknown) {
  return adapt(() => {
    const input = z.object({ uid: IdSchema }).parse(raw);
    return UserSchema.parse({ schemaVersion: 1, id: input.uid });
  });
}

const PlanInputSchema = z.object({
  id: IdSchema.optional(), userId: IdSchema.optional(), version: VersionSchema.optional(),
  name: IdSchema, goal: z.string().optional(), isActive: z.boolean(), weeklyFrequency: z.number().optional(),
  createdAt: nullableOptional(LegacyInstantSchema), updatedAt: nullableOptional(LegacyInstantSchema),
  days: z.array(z.object({ id: IdSchema, name: IdSchema, exercises: z.array(z.object({
    id: IdSchema, exerciseId: IdSchema, targetSets: z.number(), targetRepsMin: z.number(), targetRepsMax: z.number(),
  })) })),
});
export function adaptLegacyPlan(raw: unknown, scope: ReadScope) {
  return adapt(issues => {
    const input = PlanInputSchema.parse(raw);
    const owner = identity(input, scope, issues);
    if (input.version === undefined) issue(issues, 'version', 'legacy_version', 'Missing OCC version represented as zero; never written back');
    return PlanSchema.parse({
      ...input, ...owner, schemaVersion: 1, version: input.version ?? 0,
      days: input.days.map(day => ({ ...day, exercises: day.exercises.map(({ exerciseId, ...exercise }) => ({
        ...exercise, exercise: resolveExercise(exerciseId),
      })) })),
    });
  });
}

export function adaptLegacyBodyweight(raw: unknown, scope: ReadScope) {
  return adapt(issues => {
    const input = z.object({ id: IdSchema.optional(), userId: IdSchema.optional(), weight: LegacyNumberSchema, date: LegacyInstantSchema }).parse(raw);
    const owner = identity(input, scope, issues);
    return HealthObservationSchema.parse({
      schemaVersion: 1, ...owner, metric: 'body_weight', value: input.weight, unit: 'kg', observedAt: input.date,
      source: { kind: 'legacy', collection: 'bodyweight', recordId: owner.id },
    });
  });
}
