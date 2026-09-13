import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adaptLegacyWorkoutsForAnalytics,
  analyzeExerciseProgressionFromCanonicalResult,
  analyzeExerciseProgressionFromCanonicalSessions,
  extractExerciseHistoryFromCanonicalResult,
  type AnalyticsDiagnostic,
} from '../src/domain/analytics/index';
import { analyzeExerciseProgression, extractExerciseHistory } from '../src/lib/progression';
import type { Workout } from '../src/types';
import type { TrainingSession } from '../src/domain/canonical';
import { normalHistory, nestedHistory, aliasHistory, workout, set } from './fixtures/phase2_workouts';

const adapt = (records: readonly unknown[]) => adaptLegacyWorkoutsForAnalytics(records, { userId: 'athlete-fixture' });

test('legacy adapter and canonical history produce the same mature public metrics', () => {
  const adapted = adapt(normalHistory);
  assert.equal(adapted.failures.length, 0);
  const canonical = extractExerciseHistoryFromCanonicalResult(adapted.sessions, 'bench_press');
  const legacy = extractExerciseHistory(normalHistory, 'bench_press');
  assert.equal(canonical.data.length, legacy.length);
  assert.deepEqual(canonical.data.map(item => ({ id: item.workoutId, e1rm: item.maxE1RM, volume: item.totalVolume, sets: item.setsCount })), legacy.map(item => ({ id: item.workoutId, e1rm: item.maxE1RM, volume: item.totalVolume, sets: item.setsCount })));
  assert.deepEqual(canonical.data.map(item => item.sets.map(item => item.weightKg)), legacy.map(item => item.sets.map(item => item.weight)));
});

test('a canonical TrainingSession can enter analytics without a legacy workout shape', () => {
  const session: TrainingSession = {
    schemaVersion: 1,
    id: 'canonical-session',
    userId: 'athlete-fixture',
    version: 1,
    title: 'Canonical Session',
    status: 'COMPLETED',
    scheduledDate: '2026-09-05',
    exercises: [{
      id: 'canonical-bench',
      exercise: { kind: 'catalog', exerciseId: 'bench_press', label: 'Barbell Bench Press' },
      sets: [{ id: 'canonical-set', weightKg: 80, reps: 8, completion: 'completed', setType: 'N', rir: 2, rpe: 8 }],
    }],
  };
  const history = extractExerciseHistoryFromCanonicalResult([session], 'bench_press');
  assert.equal(history.diagnostics.length, 0);
  assert.equal(history.data[0]?.maxE1RM, 106.7);
  assert.equal(analyzeExerciseProgressionFromCanonicalResult(history.data, 'bench_press').data.state, 'INSUFFICIENT_DATA');
});

test('canonical input is sufficient for progression and preserves the legacy report contract', () => {
  const adapted = adapt(normalHistory);
  const canonicalHistory = extractExerciseHistoryFromCanonicalResult(adapted.sessions, 'bench_press');
  const canonicalReport = analyzeExerciseProgressionFromCanonicalResult(canonicalHistory.data, 'bench_press');
  const legacyReport = analyzeExerciseProgression(normalHistory, 'bench_press');
  assert.deepEqual(canonicalReport.data, legacyReport);
  assert.deepEqual(analyzeExerciseProgressionFromCanonicalSessions(adapted.sessions, 'bench_press'), canonicalReport.data);
  assert.equal(canonicalReport.data.state, 'PROGRESSING');
  assert.equal(canonicalReport.data.nextTarget.action, 'INCREASE_WEIGHT');
});

test('flat and nested legacy representations both adapt without duplicate sessions', () => {
  const flat = adapt(normalHistory);
  const nested = adapt(nestedHistory);
  assert.equal(flat.sessions.length, normalHistory.length);
  assert.equal(nested.sessions.length, nestedHistory.length);
  assert.ok(nested.sessions.every(session => session.legacy?.representation === 'nested'));
  const flatHistory = extractExerciseHistoryFromCanonicalResult(flat.sessions, 'bench_press').data;
  const nestedHistoryResult = extractExerciseHistoryFromCanonicalResult(nested.sessions, 'bench_press').data;
  assert.deepEqual(nestedHistoryResult.map(item => item.maxE1RM), flatHistory.map(item => item.maxE1RM));
  assert.deepEqual(nestedHistoryResult.map(item => item.totalVolume), flatHistory.map(item => item.totalVolume));
});

test('canonical completion semantics include unknown sets and exclude explicit incomplete data', () => {
  const mixed = workout('completion', '2026-08-20', [
    set('completed', 80, 8, { completed: true }),
    set('unknown', 80, 7, { completed: undefined }),
    set('incomplete', 100, 8, { completed: false }),
  ]);
  const canonical = extractExerciseHistoryFromCanonicalResult(adapt([mixed]).sessions, 'bench_press');
  assert.equal(canonical.data[0]?.setsCount, 2);
  assert.deepEqual(canonical.data[0]?.sets.map(item => item.completion), ['completed', 'unknown']);
  assert.equal(extractExerciseHistoryFromCanonicalResult(adapt([{ ...mixed, status: 'IN_PROGRESS' }]).sessions, 'bench_press').data.length, 0);
});

test('explicit identity aliases map legacy labels while unknown/custom identities remain unresolved', () => {
  const alias = extractExerciseHistoryFromCanonicalResult(adapt(aliasHistory).sessions, 'bench_press');
  assert.equal(alias.data.length, aliasHistory.length);
  assert.equal(alias.data[0]?.setsCount, 3);

  const custom = workout('custom', '2026-08-29', [set('custom', 20, 8, { exercise: 'My Press' })]);
  const customResult = extractExerciseHistoryFromCanonicalResult(adapt([custom]).sessions, 'my_press');
  assert.equal(customResult.data.length, 1);
  assert.equal(customResult.data[0]?.sets[0]?.exercise.kind, 'unresolved');
  assert.ok(customResult.diagnostics.some(item => item.code === 'unknown_exercise_identity'));
  const unknown = extractExerciseHistoryFromCanonicalResult(adapt([custom]).sessions, 'missing_custom');
  assert.equal(unknown.data.length, 0);
});

test('ambiguous identity is diagnosed and cannot select arbitrary exercises', () => {
  const diagnostics: AnalyticsDiagnostic[] = [];
  const result = extractExerciseHistoryFromCanonicalResult(adapt(aliasHistory).sessions, 'press');
  diagnostics.push(...result.diagnostics);
  assert.equal(result.data.length, 0);
  assert.ok(diagnostics.some(item => item.code === 'ambiguous_exercise_identity' && item.severity === 'failure'));
  const progression = analyzeExerciseProgressionFromCanonicalResult([], 'press');
  assert.ok(progression.diagnostics.some(item => item.code === 'ambiguous_exercise_identity' && item.severity === 'failure'));
});

test('canonical ordering, RIR e1RM and volume retain deterministic policy', () => {
  const adapted = adapt(normalHistory);
  const result = extractExerciseHistoryFromCanonicalResult(adapted.sessions, 'bench_press');
  assert.deepEqual(result.data.map(item => item.workoutId), ['upper-1', 'upper-2', 'upper-3']);
  assert.equal(result.data[0]?.maxE1RM, 106.7);
  assert.equal(result.data[0]?.totalVolume, 1600);
  assert.equal(result.data[2]?.maxE1RM, 113.3);
  assert.equal(result.data[2]?.totalVolume, 1275);
});

test('safe legacy numeric strings are normalized with explicit diagnostics', () => {
  const input = workout('numeric-strings', '2026-09-04', [set('string-values', '80' as unknown as number, '8' as unknown as number, {
    rir: '2' as unknown as number,
    rpe: '8' as unknown as number,
  })]);
  const adapted = adapt([input]);
  assert.equal(adapted.failures.length, 0);
  const history = extractExerciseHistoryFromCanonicalResult(adapted.sessions, 'bench_press');
  assert.equal(history.data[0]?.maxE1RM, 106.7);
  assert.equal(history.data[0]?.topRIR, 2);
  assert.equal(history.data[0]?.topRPE, 8);
  assert.equal(adapted.diagnostics.filter(item => item.code === 'numeric_string_normalized').length, 4);
});

test('adapter diagnostics are surfaced without mutating persisted input', () => {
  const source = workout('diagnostic', '2026-08-30', [set('valid'), set('bad', -10)]);
  const before = structuredClone(source);
  const adapted = adapt([source]);
  assert.deepEqual(source, before);
  assert.ok(adapted.diagnostics.some(item => item.code === 'invalid_measurement'));
  assert.equal(adapted.failures.length, 0);
  assert.equal(extractExerciseHistoryFromCanonicalResult(adapted.sessions, 'bench_press').data[0]?.setsCount, 1);

  const invalidCollection = adaptLegacyWorkoutsForAnalytics(null as unknown as readonly unknown[]);
  assert.equal(invalidCollection.failures[0]?.index, -1);
  assert.equal(invalidCollection.diagnostics[0]?.code, 'invalid_collection');
});

test('malformed mirrors do not poison a usable representation', () => {
  const flat = workout('flat-recovery', '2026-08-31', [set('valid')], { exercises: {} } as unknown as Partial<Workout>);
  const flatResult = adapt([flat]);
  assert.equal(flatResult.failures.length, 0);
  assert.ok(flatResult.diagnostics.some(item => item.code === 'malformed_exercises_ignored'));
  assert.equal(extractExerciseHistoryFromCanonicalResult(flatResult.sessions, 'bench_press').data.length, 1);

  const nested = workout('nested-recovery', '2026-09-01', [], {
    sets: {},
    exercises: [{ id: 'e', exerciseId: 'bench_press', sets: [{ id: 'valid', weight: 80, reps: 8, completed: true }] }],
  } as unknown as Partial<Workout>);
  const nestedResult = adapt([nested]);
  assert.equal(nestedResult.failures.length, 0);
  assert.ok(nestedResult.diagnostics.some(item => item.code === 'malformed_sets_ignored'));
  assert.equal(extractExerciseHistoryFromCanonicalResult(nestedResult.sessions, 'bench_press').data.length, 1);
});

test('duplicate nested set IDs remain associated with their canonical exercise', () => {
  const input = workout('duplicate-set-id', '2026-09-02', [], {
    exercises: [
      { id: 'squat-group', exerciseId: 'squat', sets: [{ id: 'shared', weight: 140, reps: 5, completed: true }] },
      { id: 'bench-group', exerciseId: 'bench_press', sets: [{ id: 'shared', weight: 80, reps: 8, completed: true }] },
    ],
  } as unknown as Partial<Workout>);

  const result = extractExerciseHistory([input], 'bench_press');
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sets[0]?.exercise, 'bench_press');
  assert.equal(result[0]?.sets[0]?.weight, 80);
});
