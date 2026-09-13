import { z } from 'zod';

// Domain identifiers are not Firestore paths. Transport validation remains separate.
export const IdSchema = z.string().min(1).refine(value => value.trim().length > 0, 'Empty identifier');
export const VersionSchema = z.number().int().nonnegative();
export const InstantSchema = z.iso.datetime({ offset: true });
export const CalendarDateSchema = z.iso.date();
export const WeightKgSchema = z.number().finite().min(0).max(1000);
export const RepsSchema = z.number().int().min(0).max(200);
export const RirSchema = z.number().finite().min(0).max(10);
export const RpeSchema = z.number().finite().min(1).max(10);

export const RecordReferenceSchema = z.object({
  entityType: z.enum(['training_session', 'exercise', 'plan', 'health_observation', 'observation', 'trend']),
  entityId: IdSchema,
  version: VersionSchema.optional(),
}).strict();

export const ProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('legacy'), collection: IdSchema, recordId: IdSchema }).strict(),
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('deterministic'), algorithm: IdSchema, algorithmVersion: IdSchema }).strict(),
  z.object({ kind: z.literal('provider'), provider: IdSchema, externalId: IdSchema }).strict(),
  z.object({ kind: z.literal('ai'), model: IdSchema }).strict(),
]);

export const ownedRecord = {
  schemaVersion: z.literal(1),
  id: IdSchema,
  userId: IdSchema,
};

export function uniqueIds<T extends { id: string }>(values: T[]): boolean {
  return new Set(values.map(value => value.id)).size === values.length;
}
