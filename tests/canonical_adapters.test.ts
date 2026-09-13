import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISE_DATABASE } from '../src/lib/exercises';
import {
  adaptLegacyWorkout, adaptLegacyWorkouts, adaptAuthUser, adaptLegacyProfile,
  adaptLegacyPlan, adaptLegacyBodyweight, adaptCatalogExercise, resolveExercise, type AdapterResult,
} from '../src/domain/canonical/adapters';
import { TrainingSessionSchema } from '../src/domain/canonical';

const scope = { userId: 'u' };
const rawSet = { id: 's1', exercise: 'bench_press', weight: 80, reps: 8, completed: true };
const workout = { id: 'w1', userId: 'u', title: 'Upper', scheduledDate: '2026-09-13', version: 5, status: 'COMPLETED', sets: [rawSet] };
function data<T>(result: AdapterResult<T>): T {
  if (!result.success) assert.fail(JSON.stringify(result.issues));
  return result.data;
}

test('flat persisted workouts produce canonical kg performance without changing source or OCC', () => {
  const source = structuredClone(workout);
  const before = structuredClone(source);
  const result = data(adaptLegacyWorkout(source, scope));
  assert.deepEqual(source, before);
  assert.equal(result.version, 5);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.exercises[0]?.exercise, { kind: 'catalog', exerciseId: 'bench_press', label: 'bench_press' });
  assert.equal(result.exercises[0]?.sets[0]?.weightKg, 80);
  assert.equal(result.exercises[0]?.sets[0]?.completion, 'completed');
  assert.equal(TrainingSessionSchema.safeParse(result).success, true);
});

test('nested exercises win over flat mirrors without duplicate volume or loss of targets/notes/order', () => {
  const source = { ...workout, sets: [{ ...rawSet, weight: 999 }], exercises: [
    { id: 'e1', exerciseId: 'bench_press', name: 'Bench', notes: 'pause', sets: [{ id: 'nested', weight: 80, reps: 8, targetWeight: 82.5, targetReps: 9, setType: 'normal', rir: 2, rpe: 8, completed: true, notes: 'good' }] },
    { id: 'e2', exerciseId: 'bench_press', sets: [] },
  ] };
  const before = structuredClone(source);
  const adapted = adaptLegacyWorkout(source, scope);
  const result = data(adapted);
  assert.equal(result.exercises.length, 2);
  assert.equal(result.exercises.flatMap(e => e.sets).reduce((sum, s) => sum + s.weightKg * s.reps, 0), 640);
  assert.deepEqual(result.exercises[0]?.sets[0], { id: 'nested', weightKg: 80, reps: 8, targetWeightKg: 82.5, targetReps: 9, setType: 'N', completion: 'completed', rir: 2, rpe: 8, notes: 'good' });
  assert.equal(result.exercises[0]?.notes, 'pause');
  assert.ok(adapted.issues.some(i => i.code === 'nested_precedence'));
  assert.deepEqual(source, before);
});

test('legacy status aliases and explicit/missing completion retain their meaning', () => {
  for (const [status, expected] of [['planned', 'PLANNED'], ['in-progress', 'IN_PROGRESS'], ['completed', 'COMPLETED'], ['skipped', 'SKIPPED'], ['IN_PROGRESS', 'IN_PROGRESS']]) {
    assert.equal(data(adaptLegacyWorkout({ ...workout, status }, scope)).status, expected);
  }
  const result = data(adaptLegacyWorkout({ ...workout, sets: [
    { ...rawSet, completed: undefined }, { ...rawSet, id: 's2', completed: false }, { ...rawSet, id: 's3', weight: 0 },
  ] }, scope));
  assert.deepEqual(result.exercises[0]?.sets.map(s => s.completion), ['unknown', 'not_completed', 'completed']);
});

test('missing optional legacy fields have stable read-only defaults, scoped owner and no invented dates', () => {
  const raw = { name: 'Legacy', status: 'planned', sets: [{ exercise: 'Custom', weight: 0, reps: 0 }] };
  const context = { ...scope, documentId: 'old' };
  const first = adaptLegacyWorkout(raw, context);
  assert.deepEqual(first, adaptLegacyWorkout(raw, context));
  const result = data(first);
  assert.equal(result.id, 'old'); assert.equal(result.userId, 'u'); assert.equal(result.version, 0);
  assert.equal(result.title, 'Legacy'); assert.equal(result.scheduledDate, undefined);
  assert.equal(result.completedAt, undefined);
  assert.ok(first.issues.some(i => i.code === 'scoped_owner'));
  assert.ok(first.issues.some(i => i.code === 'derived_id'));
});

test('timestamps normalize to UTC; date-only stays calendar date; duration is explicitly ambiguous', () => {
  const result = adaptLegacyWorkout({ ...workout, startedAt: 0, completedAt: 3600000, createdAt: '2026-09-13T14:00:00+02:00', duration: 3600 }, scope);
  const session = data(result);
  assert.equal(session.startedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(session.completedAt, '1970-01-01T01:00:00.000Z');
  assert.equal(session.createdAt, '2026-09-13T12:00:00.000Z');
  assert.equal(session.scheduledDate, '2026-09-13');
  assert.equal(session.legacy?.duration, 3600);
  assert.ok(result.issues.some(i => i.code === 'ambiguous_duration'));
});

test('decimal strings are normalized only at the legacy boundary, without unsafe coercion', () => {
  assert.equal(data(adaptLegacyWorkout({ ...workout, sets: [{ ...rawSet, weight: '82.5', reps: '8' }] }, scope)).exercises[0]?.sets[0]?.weightKg, 82.5);
  for (const weight of ['', ' ', null, false, '0x20', NaN, Infinity, -1, 'Infinity', 1001]) {
    assert.equal(adaptLegacyWorkout({ ...workout, sets: [{ ...rawSet, weight }] }, scope).success, false);
  }
  assert.equal(adaptLegacyWorkout({ ...workout, sets: [{ ...rawSet, completed: 'false' }] }, scope).success, false);
});

test('identity mismatch, malformed data and duplicate IDs fail visibly without poisoning good records', () => {
  assert.equal(adaptLegacyWorkout(workout, { userId: 'other' }).success, false);
  assert.equal(adaptLegacyWorkout(workout, { ...scope, documentId: 'other' }).success, false);
  for (const raw of [null, [], { ...workout, sets: {} }, { ...workout, exercises: {} }, { ...workout, status: 'invalid' }, { ...workout, sets: [rawSet, rawSet] }, { ...workout, version: -1 }]) {
    assert.equal(adaptLegacyWorkout(raw, scope).success, false);
  }
  const batch = adaptLegacyWorkouts([workout, { ...workout, userId: 'other' }, { ...workout, id: 'w2' }], scope);
  assert.deepEqual(batch.sessions.map(s => s.id), ['w1', 'w2']);
  assert.deepEqual(batch.failures.map(f => f.index), [1]);
  assert.equal(adaptLegacyWorkouts({}, scope).failures[0]?.index, -1);
  assert.equal(adaptLegacyWorkouts([], { userId: '' }).failures[0]?.issues[0]?.code, 'invalid_scope');
});

test('exact catalog aliases resolve, ambiguous partial names remain unresolved, and A/B/A blocks stay ordered', () => {
  for (const identifier of ['bench_press', 'BENCH-PRESS', 'Barbell Bench Press']) assert.equal(resolveExercise(identifier).kind, 'catalog');
  for (const identifier of ['Bench', 'Press', 'My custom press']) {
    assert.deepEqual(resolveExercise(identifier), { kind: 'unresolved', legacyIdentifier: identifier, label: identifier });
  }
  const result = data(adaptLegacyWorkout({ ...workout, sets: [rawSet, { ...rawSet, id: 's2', exercise: 'squat' }, { ...rawSet, id: 's3' }] }, scope));
  assert.deepEqual(result.exercises.map(e => e.sets[0]?.id), ['s1', 's2', 's3']);
  for (const exercise of EXERCISE_DATABASE) assert.equal(adaptCatalogExercise(exercise).success, true);
});

test('profile/auth normalization excludes credentials and permissions', () => {
  const user = data(adaptAuthUser({ uid: 'u', getIdToken: () => 'secret', email: 'private@example.com' }));
  assert.deepEqual(user, { schemaVersion: 1, id: 'u' });
  const profile = data(adaptLegacyProfile({ userId: 'u', createdAt: 0, name: 'Athlete', primaryGoal: 'strength', daysPerWeek: 3, autonomyLevel: 'L3_FULL_AUTONOMY', permissionEpoch: 10 }, scope));
  assert.deepEqual(profile.preferences, { primaryGoal: 'strength', daysPerWeek: 3 });
  assert.equal(profile.createdAt, '1970-01-01T00:00:00.000Z');
  assert.equal('permissionEpoch' in profile, false);
  assert.equal(adaptLegacyProfile({ userId: 'other' }, scope).success, false);
  assert.equal(adaptLegacyProfile({ userId: 'u', daysPerWeek: 9 }, scope).success, false);
});

test('plans accept existing numeric and server string timestamps, retain OCC and reject reversed ranges', () => {
  const plan = { id: 'p', userId: 'u', name: 'Plan', isActive: false, createdAt: 0, days: [{ id: 'd', name: 'Day', exercises: [{ id: 'e', exerciseId: 'squat', targetSets: 3, targetRepsMin: 6, targetRepsMax: 8 }] }] };
  const before = structuredClone(plan);
  assert.equal(data(adaptLegacyPlan(plan, scope)).version, 0);
  assert.equal(data(adaptLegacyPlan({ ...plan, version: 7, createdAt: '2026-09-13T12:00:00Z' }, scope)).version, 7);
  assert.deepEqual(plan, before);
  assert.equal(adaptLegacyPlan({ ...plan, days: [{ id: 'd', name: 'Day', exercises: [{ id: 'e', exerciseId: 'squat', targetSets: 3, targetRepsMin: 9, targetRepsMax: 8 }] }] }, scope).success, false);
});

test('bodyweight is a kg observation with source identity, valid time and strict owner scope', () => {
  assert.deepEqual(data(adaptLegacyBodyweight({ id: 'b', userId: 'u', weight: 80.5, date: 0 }, scope)), {
    schemaVersion: 1, id: 'b', userId: 'u', metric: 'body_weight', value: 80.5, unit: 'kg', observedAt: '1970-01-01T00:00:00.000Z',
    source: { kind: 'legacy', collection: 'bodyweight', recordId: 'b' },
  });
  for (const weight of [0, -1, Infinity]) assert.equal(adaptLegacyBodyweight({ id: 'b', userId: 'u', weight, date: 0 }, scope).success, false);
  assert.equal(adaptLegacyBodyweight({ id: 'b', userId: 'other', weight: 80, date: 0 }, scope).success, false);
});
