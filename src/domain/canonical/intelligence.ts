import { z } from 'zod';
import { IdSchema, InstantSchema, ownedRecord, ProvenanceSchema, RecordReferenceSchema } from './common';

export const MeasurementSchema = z.object({ metric: IdSchema, value: z.number().finite(), unit: IdSchema }).strict();
export const ObservationSchema = z.object({
  ...ownedRecord,
  observedAt: InstantSchema,
  measurement: MeasurementSchema,
  source: ProvenanceSchema,
  evidence: z.array(RecordReferenceSchema).min(1),
}).strict();
export const TrendSchema = z.object({
  ...ownedRecord,
  observationIds: z.array(IdSchema).min(1),
  metric: IdSchema,
  direction: z.enum(['increasing', 'stable', 'decreasing', 'insufficient_data']),
  windowStart: InstantSchema,
  windowEnd: InstantSchema,
  computedAt: InstantSchema,
  source: ProvenanceSchema,
}).strict().refine(value => Date.parse(value.windowEnd) >= Date.parse(value.windowStart), {
  message: 'Trend window is reversed', path: ['windowEnd'],
});
export const RecommendationSchema = z.object({
  ...ownedRecord,
  observationIds: z.array(IdSchema),
  trendIds: z.array(IdSchema),
  rationale: IdSchema,
  createdAt: InstantSchema,
  source: ProvenanceSchema,
  // Link only: a recommendation is never an executable proposal or permission.
  proposalId: IdSchema.optional(),
}).strict().refine(value => value.observationIds.length + value.trendIds.length > 0, 'Recommendation requires evidence');
export const DecisionSchema = z.object({
  ...ownedRecord,
  recommendationId: IdSchema,
  choice: z.enum(['accepted', 'rejected', 'deferred']),
  decidedAt: InstantSchema,
  reason: z.string().optional(),
  proposalId: IdSchema.optional(),
  auditLogId: IdSchema.optional(),
}).strict();
export const OutcomeSchema = z.object({
  ...ownedRecord,
  decisionId: IdSchema,
  observationIds: z.array(IdSchema).min(1),
  measuredAt: InstantSchema,
  assessment: z.enum(['improved', 'unchanged', 'worsened', 'inconclusive']),
  source: ProvenanceSchema,
}).strict();

export type Observation = z.infer<typeof ObservationSchema>;
export type Trend = z.infer<typeof TrendSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
