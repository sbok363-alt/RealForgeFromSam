import { z } from 'zod';
import { IdSchema } from './common';

export const MuscleSchema = z.enum(['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE', 'FULL_BODY']);
export const ExerciseSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: IdSchema,
  primaryMuscle: MuscleSchema,
  secondaryMuscles: z.array(MuscleSchema).optional(),
  equipment: z.enum(['BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'OTHER']),
  movementPattern: z.enum(['PUSH', 'PULL', 'HINGE', 'SQUAT', 'LUNGE', 'CARRY', 'ISOLATION']),
  description: z.string().optional(),
}).strict();

// Do not invent a catalog identity for free-text/custom exercises.
export const ExerciseReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), exerciseId: IdSchema, label: IdSchema }).strict(),
  z.object({ kind: z.literal('unresolved'), legacyIdentifier: IdSchema, label: IdSchema }).strict(),
]);
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseReference = z.infer<typeof ExerciseReferenceSchema>;
