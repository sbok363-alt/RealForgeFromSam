import type { Workout, WorkoutSetItem } from '../../src/types';

export function workout(id: string, date: string, sets: WorkoutSetItem[], extra: Partial<Workout> = {}): Workout {
  return { id, userId: 'athlete-fixture', title: 'Upper strength A', scheduledDate: date, status: 'COMPLETED', version: 4, sets, ...extra };
}
export function set(id: string, weight = 80, reps = 8, extra: Partial<WorkoutSetItem> = {}): WorkoutSetItem {
  return { id, exercise: 'bench_press', weight, reps, completed: true, ...extra };
}
export const normalHistory = [
  workout('upper-3', '2026-08-27', [set('3a', 85, 8, { rir: 2, rpe: 8, notes: 'Controlled pause', setType: 'N' }), set('3b', 85, 7, { rir: 1 }), set('3c', 85, 6, { completed: false })]),
  workout('upper-1', '2026-08-20', [set('1w', 40, 10, { setType: 'W' }), set('1a', 80, 8, { rir: 2, rpe: 8 }), set('1b', 80, 7, { rir: 1 })]),
  workout('upper-2', '2026-08-23', [set('2a', 82.5, 8, { rir: 2, rpe: 8 }), set('2b', 82.5, 7, { rir: 1 })]),
];
export const nestedHistory = normalHistory.map(w => ({ ...w, sets: [], exercises: [{
  id: `${w.id}-bench`, exerciseId: 'bench_press', name: 'Barbell Bench Press',
  sets: w.sets.map(({ exercise: _exercise, ...s }) => ({ ...s, completed: s.completed ?? false })),
}] }));
export const aliasHistory = normalHistory.map((w, i) => ({ ...w, sets: w.sets.map(s => ({ ...s, exercise: ['bench_press', 'Barbell Bench Press', 'Bench Press'][i]! })) }));
export const stallHistory = normalHistory.map(w => ({ ...w, sets: [set(`${w.id}-a`, 80, 8, { rir: 2 })] }));
export const regressHistory = [
  workout('strong', '2026-08-20', [set('a', 100, 8, { rir: 1 })]),
  workout('fatigued', '2026-08-23', [set('b', 90, 6, { rir: 0, rpe: 10 })]),
];
export const repProgressHistory = [workout('a', '2026-08-20', [set('a', 80, 5)]), workout('b', '2026-08-23', [set('b', 80, 6)])];
export const goldenCases = { normal: normalHistory, nested: nestedHistory, aliases: aliasHistory, stall: stallHistory, regress: regressHistory, reps: repProgressHistory, cold: [], single: [normalHistory[0]!] } satisfies Record<string, Workout[]>;
