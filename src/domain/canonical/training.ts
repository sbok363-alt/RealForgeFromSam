import { z } from 'zod';
import { CalendarDateSchema, IdSchema, InstantSchema, ownedRecord, RepsSchema, RirSchema, RpeSchema, uniqueIds, VersionSchema, WeightKgSchema } from './common';
import { ExerciseReferenceSchema } from './exercise';

export const SetPerformanceSchema = z.object({
  id: IdSchema,
  weightKg: WeightKgSchema,
  reps: RepsSchema,
  completion: z.enum(['completed', 'not_completed', 'unknown']),
  setType: z.enum(['N', 'W', 'D', 'F']),
  targetWeightKg: WeightKgSchema.optional(),
  targetReps: RepsSchema.optional(),
  rir: RirSchema.optional(),
  rpe: RpeSchema.optional(),
  notes: z.string().optional(),
}).strict();

export const ExercisePerformanceSchema = z.object({
  id: IdSchema,
  exercise: ExerciseReferenceSchema,
  sets: z.array(SetPerformanceSchema).refine(uniqueIds, 'Duplicate set IDs within exercise'),
  notes: z.string().optional(),
}).strict();

export const TrainingSessionSchema = z.object({
  ...ownedRecord,
  version: VersionSchema,
  title: IdSchema,
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
  scheduledDate: CalendarDateSchema.optional(),
  exercises: z.array(ExercisePerformanceSchema).refine(uniqueIds, 'Duplicate exercise performance IDs'),
  planId: IdSchema.optional(),
  notes: z.string().optional(),
  startedAt: InstantSchema.optional(),
  completedAt: InstantSchema.optional(),
  createdAt: InstantSchema.optional(),
  updatedAt: InstantSchema.optional(),
  legacy: z.object({
    representation: z.enum(['flat', 'nested']),
    // Existing producers disagree on seconds/minutes. Never use as canonical duration.
    duration: z.number().finite().nonnegative().optional(),
    volume: z.number().finite().nonnegative().optional(),
    totalVolume: z.number().finite().nonnegative().optional(),
  }).strict().optional(),
}).strict().refine(value => !value.startedAt || !value.completedAt || Date.parse(value.completedAt) >= Date.parse(value.startedAt), {
  message: 'Completion precedes start', path: ['completedAt'],
});

export type SetPerformance = z.infer<typeof SetPerformanceSchema>;
export type ExercisePerformance = z.infer<typeof ExercisePerformanceSchema>;
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;
