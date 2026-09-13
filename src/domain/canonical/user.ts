import { z } from 'zod';
import { IdSchema, InstantSchema, ownedRecord } from './common';

// Preferences never include permissionEpoch or autonomyLevel.
export const PreferencesSchema = z.object({
  experience: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  goals: z.array(z.string()).optional(),
  primaryGoal: z.enum(['strength', 'hypertrophy', 'recomp', 'general']).optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  equipment: z.enum(['full_gym', 'home_basic', 'bodyweight']).optional(),
}).strict();

export const ProfileSchema = z.object({
  ...ownedRecord,
  name: z.string().optional(),
  preferences: PreferencesSchema,
  onboardingCompleted: z.boolean().optional(),
  onboardingCompletedAt: InstantSchema.optional(),
  createdAt: InstantSchema.optional(),
}).strict();

// Firebase uid maps to id; credentials/tokens and permissions do not belong here.
export const UserSchema = z.object({ schemaVersion: z.literal(1), id: IdSchema }).strict();
export type User = z.infer<typeof UserSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
