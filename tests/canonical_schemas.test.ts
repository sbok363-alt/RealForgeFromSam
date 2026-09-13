import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UserSchema, ProfileSchema, ExerciseSchema, SetPerformanceSchema, ExercisePerformanceSchema,
  TrainingSessionSchema, PlanSchema, ProgramSchema, HealthObservationSchema,
  ObservationSchema, TrendSchema, RecommendationSchema, DecisionSchema, OutcomeSchema,
} from '../src/domain/canonical';

const owned = { schemaVersion: 1, id: 'record', userId: 'athlete' };
const now = '2026-09-13T12:00:00.000Z';
const source = { kind: 'deterministic', algorithm: 'fixture', algorithmVersion: '1' };
const set = { id: 's', weightKg: 80, reps: 8, completion: 'completed', setType: 'N' };
const exercise = { id: 'e', exercise: { kind: 'catalog', exerciseId: 'bench_press', label: 'Bench' }, sets: [set] };
const session = { ...owned, version: 4, title: 'Upper', status: 'COMPLETED', scheduledDate: '2026-09-13', exercises: [exercise] };
const planExercise = { id: 'e', exercise: exercise.exercise, targetSets: 3, targetRepsMin: 6, targetRepsMax: 8 };
const plan = { ...owned, version: 0, name: 'Upper/lower', isActive: true, days: [{ id: 'd', name: 'Upper', exercises: [planExercise] }] };
const observation = { ...owned, observedAt: now, measurement: { metric: 'volume', value: 640, unit: 'kg_reps' }, source, evidence: [{ entityType: 'training_session', entityId: 'w', version: 4 }] };
const trend = { ...owned, observationIds: ['o'], metric: 'volume', direction: 'insufficient_data', windowStart: now, windowEnd: now, computedAt: now, source };
const recommendation = { ...owned, observationIds: ['o'], trendIds: [], rationale: 'Keep the same load pending more data', createdAt: now, source };
const decision = { ...owned, recommendationId: 'r', choice: 'deferred', decidedAt: now };
const outcome = { ...owned, decisionId: 'd', observationIds: ['o2'], measuredAt: now, assessment: 'inconclusive', source };

test('every canonical entity accepts its minimal valid contract and rejects extra authority', () => {
  const fixtures = [
    [UserSchema, { schemaVersion: 1, id: 'athlete' }],
    [ProfileSchema, { ...owned, preferences: { primaryGoal: 'strength' } }],
    [ExerciseSchema, { schemaVersion: 1, id: 'bench_press', name: 'Bench', primaryMuscle: 'CHEST', equipment: 'BARBELL', movementPattern: 'PUSH' }],
    [SetPerformanceSchema, set], [ExercisePerformanceSchema, exercise], [TrainingSessionSchema, session],
    [PlanSchema, plan], [ProgramSchema, plan],
    [HealthObservationSchema, { ...owned, metric: 'body_weight', value: 80, unit: 'kg', observedAt: now, source: { kind: 'manual' } }],
    [ObservationSchema, observation], [TrendSchema, trend], [RecommendationSchema, recommendation],
    [DecisionSchema, decision], [OutcomeSchema, outcome],
  ] as const;
  for (const [schema, fixture] of fixtures) {
    assert.equal(schema.safeParse(fixture).success, true);
    assert.equal(schema.safeParse({ ...fixture, permissionEpoch: 7 }).success, false);
    assert.equal(schema.safeParse({ ...fixture, payload: { bypass: true } }).success, false);
  }
});

test('canonical sets reject coercion, nonfinite/negative values and invalid ranges', () => {
  for (const weightKg of [NaN, Infinity, -1, 1001, '80', true, null]) {
    assert.equal(SetPerformanceSchema.safeParse({ ...set, weightKg }).success, false);
  }
  for (const reps of [-1, 201, 1.5, '8']) assert.equal(SetPerformanceSchema.safeParse({ ...set, reps }).success, false);
  for (const rir of [-1, 11, Infinity]) assert.equal(SetPerformanceSchema.safeParse({ ...set, rir }).success, false);
  for (const rpe of [0, 11, NaN]) assert.equal(SetPerformanceSchema.safeParse({ ...set, rpe }).success, false);
  assert.equal(SetPerformanceSchema.safeParse({ ...set, weightKg: 0, reps: 0, completion: 'not_completed' }).success, true);
  assert.equal(SetPerformanceSchema.safeParse({ ...set, setType: 'normal' }).success, false);
});

test('dates, versions and repeated identities cannot silently corrupt canonical history', () => {
  for (const scheduledDate of ['2026-02-30', '2026-13-01', 'yesterday', '2026-09-13T00:00:00Z']) {
    assert.equal(TrainingSessionSchema.safeParse({ ...session, scheduledDate }).success, false);
  }
  for (const version of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.equal(TrainingSessionSchema.safeParse({ ...session, version }).success, false);
  }
  assert.equal(TrainingSessionSchema.safeParse({ ...session, startedAt: now, completedAt: '2026-09-12T12:00:00Z' }).success, false);
  assert.equal(TrainingSessionSchema.safeParse({ ...session, exercises: [exercise, exercise] }).success, false);
  assert.equal(ExercisePerformanceSchema.safeParse({ ...exercise, sets: [set, set] }).success, false);
});

test('plan ranges and nested preferences remain strict; programs reuse the current plan contract', () => {
  assert.equal(PlanSchema.safeParse({ ...plan, days: [{ ...plan.days[0], exercises: [{ ...planExercise, targetRepsMin: 9 }] }] }).success, false);
  assert.equal(PlanSchema.safeParse({ ...plan, weeklyFrequency: 8 }).success, false);
  assert.equal(ProfileSchema.safeParse({ ...owned, preferences: { autonomyLevel: 'L3_FULL_AUTONOMY' } }).success, false);
  assert.equal(ProgramSchema, PlanSchema);
});

test('health units and intelligence evidence are explicit without conferring execution authority', () => {
  assert.equal(HealthObservationSchema.safeParse({ ...owned, metric: 'body_weight', value: 80, unit: 'lb', observedAt: now, source }).success, false);
  assert.equal(ObservationSchema.safeParse({ ...observation, evidence: [] }).success, false);
  assert.equal(TrendSchema.safeParse({ ...trend, windowEnd: '2026-09-12T00:00:00Z' }).success, false);
  assert.equal(RecommendationSchema.safeParse({ ...recommendation, observationIds: [], trendIds: [] }).success, false);
  assert.equal(DecisionSchema.safeParse({ ...decision, choice: 'EXECUTED' }).success, false);
  assert.equal(OutcomeSchema.safeParse({ ...outcome, observationIds: [] }).success, false);
});
