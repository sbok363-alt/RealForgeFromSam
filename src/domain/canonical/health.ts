import { z } from 'zod';
import { InstantSchema, ownedRecord, ProvenanceSchema } from './common';

// Bodyweight is the only health measurement with an existing storage contract.
// Add other metrics as discriminated, unit-specific variants when implemented.
export const HealthObservationSchema = z.object({
  ...ownedRecord,
  metric: z.literal('body_weight'),
  value: z.number().finite().positive().max(1000),
  unit: z.literal('kg'),
  observedAt: InstantSchema,
  source: ProvenanceSchema,
}).strict();
export type HealthObservation = z.infer<typeof HealthObservationSchema>;
