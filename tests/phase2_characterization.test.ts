import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { extractExerciseHistory, analyzeExerciseProgression, calculateE1RM } from '../src/lib/progression';
import type { Workout } from '../src/types';
import type { AnalyticsDiagnostic } from '../src/domain/analytics/index';
import { goldenCases, normalHistory, workout, set } from './fixtures/phase2_workouts';

// Captured from the pre-refactor implementation. Never regenerate after migration.
const golden = JSON.parse(readFileSync(new URL('./fixtures/phase2_legacy_golden.json', import.meta.url), 'utf8'));
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test('pre-refactor full history/report golden contracts, including all progression branches', () => {
  for (const [name, workouts] of Object.entries(goldenCases)) {
    assert.deepEqual(json(extractExerciseHistory(workouts, 'bench_press')), golden[name].history, name);
    assert.deepEqual(json(analyzeExerciseProgression(workouts, 'bench_press')), golden[name].report, name);
  }
});
test('only exact completed statuses qualify; missing completion qualifies, false and null do not', () => {
  for (const status of ['PLANNED', 'IN_PROGRESS', 'SKIPPED', 'Completed']) {
    assert.equal(extractExerciseHistory([{ ...normalHistory[0]!, status } as Workout], 'bench_press').length, 0);
  }
  const input = workout('flags', '2026-08-20', [set('yes'), set('missing', 80, 8, { completed: undefined }), set('no', 80, 8, { completed: false }), { ...set('null'), completed: null } as unknown as ReturnType<typeof set>]);
  assert.deepEqual(extractExerciseHistory([input], 'bench_press')[0]!.sets.map(s => s.id), ['yes', 'missing']);
});
test('canonical identity keeps exact aliases and rejects legacy substring ambiguity', () => {
  const input = workout('names', '2026-08-20', [set('id'), set('full', 80, 8, { exercise: 'Barbell Bench Press' }), set('short', 80, 8, { exercise: 'Bench Press' }), set('incline', 60, 8, { exercise: 'Incline Bench Press' }), set('empty', 40, 8, { exercise: '' })]);
  // The frozen legacy golden records the old bidirectional-substring result
  // (all five names for bench_press). Canonical identity intentionally keeps
  // only the exact ID and explicit Bench Press aliases.
  assert.deepEqual(extractExerciseHistory([input], 'bench_press')[0]!.sets.map(s => s.id), ['id', 'full', 'short']);
  const diagnostics: AnalyticsDiagnostic[] = [];
  assert.equal(extractExerciseHistory([input], 'press', { onDiagnostic: d => diagnostics.push(d) }).length, 0);
  assert.ok(diagnostics.some(d => d.code === 'ambiguous_exercise_identity'));
  assert.equal(extractExerciseHistory([workout('custom', '2026-08-20', [set('custom', 20, 8, { exercise: 'My Press' })])], 'my_press').length, 1);
});
test('nested canonical representation is authoritative over flat mirrors', () => {
  const input = workout('mirror', '2026-08-20', [set('flat', 80)], { exercises: [{ id: 'e', exerciseId: 'bench_press', sets: [{ id: 'nested', weight: 100, reps: 8, completed: true, setType: 'W' }] }] });
  assert.equal(extractExerciseHistory([input], 'bench_press')[0]!.topWeight, 100);
  input.sets[0]!.completed = false;
  const nested = extractExerciseHistory([input], 'bench_press')[0]!;
  assert.equal(nested.topWeight, 100);
  assert.equal(nested.sets[0]!.setType, undefined, 'nested presentation discards setType');
});
test('canonical boundary drops invalid measurements while retaining useful zero/warmup policy', () => {
  const input = workout('invalid', '2026-08-20', [set('good'), set('zero-reps', 80, 0), set('zero-weight', 0), set('warmup', 40, 10, { setType: 'W' }), set('nan', NaN), set('negative', -10)]);
  const diagnostics: AnalyticsDiagnostic[] = [];
  const result = extractExerciseHistory([input], 'bench_press', { onDiagnostic: d => diagnostics.push(d) })[0]!;
  assert.equal(result.setsCount, 4);
  assert.equal(result.totalVolume, 1040);
  assert.equal(result.maxE1RM, 101.3);
  assert.equal(diagnostics.filter(d => d.code === 'invalid_measurement').length, 2);
  assert.equal(extractExerciseHistory([workout('empty', '2026-08-20', [])], 'bench_press').length, 0);
  assert.equal(extractExerciseHistory([workout('bodyweight', '2026-08-20', [set('zero', 0)])], 'bench_press').length, 0);
});
test('RIR clamps to 0..5 in formula; RPE is metadata and first equal e1RM set wins', () => {
  assert.equal(calculateE1RM(80, 8, 2), 106.7);
  assert.equal(calculateE1RM(80, 8, 10), calculateE1RM(80, 8, 5));
  assert.equal(calculateE1RM(80, 8, -1), calculateE1RM(80, 8));
  const input = workout('tie', '2026-08-20', [set('first', 80, 8, { rir: 2, rpe: 7 }), set('second', 80, 8, { rir: 2, rpe: 10 })]);
  assert.equal(extractExerciseHistory([input], 'bench_press')[0]!.topRPE, 7);
});
test('completion instant orders sessions, scheduled date labels them, ties preserve input order', () => {
  const input = [workout('second-date', '2026-08-23', [set('b')], { completedAt: 1000 }), workout('first-date', '2026-08-20', [set('a')], { completedAt: 1000 }), workout('epoch', '', [set('c')], { completedAt: 0 })];
  const result = extractExerciseHistory(input, 'bench_press');
  assert.deepEqual(result.map(s => s.workoutId), ['epoch', 'second-date', 'first-date']);
  assert.deepEqual(result.map(s => s.date), ['', '2026-08-23', '2026-08-20']);
  assert.deepEqual(result.map(s => s.timestamp), [0, 1000, 1000]);
});
test('duplicate source sets remain countable and malformed sets become diagnostics', () => {
  const input = { id: 'partial', status: 'COMPLETED', sets: [set('same'), set('same')] } as Workout;
  const result = extractExerciseHistory([input], 'bench_press')[0]!;
  assert.equal(result.setsCount, 2); assert.equal(result.totalVolume, 1280); assert.equal(result.workoutTitle, 'Workout');
  const diagnostics: AnalyticsDiagnostic[] = [];
  assert.doesNotThrow(() => extractExerciseHistory([{ ...input, sets: [null] } as unknown as Workout], 'bench_press', { onDiagnostic: d => diagnostics.push(d) }));
  assert.ok(diagnostics.some(d => d.code === 'malformed_set'));
});

test('duplicate nested exercise groups are both counted when they share the target identity', () => {
  const input = workout('duplicate-exercise', '2026-09-03', [], {
    exercises: [
      { id: 'e1', exerciseId: 'bench_press', sets: [{ id: 'a', weight: 80, reps: 8, completed: true }] },
      { id: 'e2', exerciseId: 'bench_press', sets: [{ id: 'b', weight: 82.5, reps: 8, completed: true }] },
    ],
  } as unknown as Partial<Workout>);
  const result = extractExerciseHistory([input], 'bench_press');
  assert.equal(result[0]?.setsCount, 2);
  assert.deepEqual(result[0]?.sets.map(item => ({ id: item.id, weight: item.weight })), [{ id: 'a', weight: 80 }, { id: 'b', weight: 82.5 }]);
});
