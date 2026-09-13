import { z } from 'zod';
import { IdSchema, InstantSchema, ownedRecord, uniqueIds, VersionSchema } from './common';
import { ExerciseReferenceSchema } from './exercise';

export const PlannedExerciseSchema = z.object({
  id: IdSchema,
  exercise: ExerciseReferenceSchema,
  targetSets: z.number().int().min(1).max(50),
  targetRepsMin: z.number().int().min(1).max(100),
  targetRepsMax: z.number().int().min(1).max(100),
}).strict().refine(value => value.targetRepsMax >= value.targetRepsMin, {
  message: 'Repetition range is reversed', path: ['targetRepsMax'],
});
export const PlanDaySchema = z.object({
  id: IdSchema,
  name: IdSchema,
  exercises: z.array(PlannedExerciseSchema).refine(uniqueIds, 'Duplicate plan exercise IDs'),
}).strict();
export const PlanSchema = z.object({
  ...ownedRecord,
  version: VersionSchema,
  name: IdSchema,
  goal: z.string().optional(),
  isActive: z.boolean(),
  weeklyFrequency: z.number().int().min(1).max(7).optional(),
  days: z.array(PlanDaySchema).refine(uniqueIds, 'Duplicate plan day IDs'),
  createdAt: InstantSchema.optional(),
  updatedAt: InstantSchema.optional(),
}).strict();

// FORGE currently has plans only. Program is vocabulary for the same contract,
// not a second persistence entity or a speculative periodization engine.
export const ProgramSchema = PlanSchema;
export type Plan = z.infer<typeof PlanSchema>;
export type Program = Plan;
