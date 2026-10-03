import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import {
  getBodyweight,
  getPersonalRecords,
  getPlans,
  getTarget1RMs,
  getWorkouts,
} from '../src/lib/api';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  get length(): number {
    return this.values.size;
  }
}

const guestUid = 'guest-local-collection-item-shape';
const otherUid = 'guest-local-other';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

function dirtyList(legacy: Record<string, unknown>, owned: Record<string, unknown>) {
  return [
    null,
    42,
    'bad-entry',
    [],
    {},
    { id: '' },
    { id: 'foreign-entry', userId: otherUid },
    legacy,
    owned,
  ];
}

localStorage.setItem(
  `forge_workouts_${guestUid}`,
  JSON.stringify(dirtyList(
    {
      id: 'legacy-workout',
      title: 'Legacy workout',
      scheduledDate: '2026-10-03',
      status: 'PLANNED',
      version: 1,
      sets: [],
      exercises: [],
    },
    {
      id: 'owned-workout',
      userId: guestUid,
      title: 'Owned workout',
      scheduledDate: '2026-10-03',
      status: 'PLANNED',
      version: 1,
      sets: [],
      exercises: [],
    },
  ))
);
localStorage.setItem(
  `forge_plans_${guestUid}`,
  JSON.stringify(dirtyList(
    { id: 'legacy-plan', name: 'Legacy plan', isActive: true, createdAt: Date.now(), days: [] },
    { id: 'owned-plan', userId: guestUid, name: 'Owned plan', isActive: true, createdAt: Date.now(), days: [] },
  ))
);
localStorage.setItem(
  `forge_bw_${guestUid}`,
  JSON.stringify(dirtyList(
    { id: 'legacy-bodyweight', weight: 53, date: Date.now() },
    { id: 'owned-bodyweight', userId: guestUid, weight: 53, date: Date.now() },
  ))
);
localStorage.setItem(
  `forge_prs_${guestUid}`,
  JSON.stringify(dirtyList(
    {
      id: 'legacy-pr',
      exerciseId: 'bench-press',
      weight: 80,
      reps: 5,
      estimated1RM: 93,
      workoutId: 'legacy-workout',
      date: Date.now(),
    },
    {
      id: 'owned-pr',
      userId: guestUid,
      exerciseId: 'bench-press',
      weight: 80,
      reps: 5,
      estimated1RM: 93,
      workoutId: 'owned-workout',
      date: Date.now(),
    },
  ))
);
localStorage.setItem(
  `forge_target_1rms_${guestUid}`,
  JSON.stringify(dirtyList(
    {
      id: 'legacy-target',
      exerciseId: 'bench-press',
      exerciseName: 'Bench Press',
      target1RM: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'owned-target',
      userId: guestUid,
      exerciseId: 'bench-press',
      exerciseName: 'Bench Press',
      target1RM: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ))
);

function assertIds(items: Array<{ id: string }>, expected: string[], label: string) {
  const ids = items.map((item) => item.id);
  assert(
    JSON.stringify(ids) === JSON.stringify(expected),
    `${label} must drop impossible/foreign cache entries and preserve valid + legacy entities; got ${JSON.stringify(ids)}`
  );
}

let failure: unknown;
try {
  assertIds(await getWorkouts(guestUid), ['legacy-workout', 'owned-workout'], 'workouts');
  assertIds(await getPlans(guestUid), ['legacy-plan', 'owned-plan'], 'plans');
  assertIds(await getBodyweight(guestUid), ['legacy-bodyweight', 'owned-bodyweight'], 'bodyweight');
  assertIds(await getPersonalRecords(guestUid), ['legacy-pr', 'owned-pr'], 'personal records');
  assertIds(await getTarget1RMs(guestUid), ['legacy-target', 'owned-target'], 'targets');
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, `Guest collection item-shape regression failed: ${String(failure)}`);
console.log('Guest collection item-shape regression passed');
