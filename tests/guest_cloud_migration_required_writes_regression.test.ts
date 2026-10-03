import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import {
  saveBodyweight,
  savePersonalRecord,
  savePlan,
  saveTarget1RM,
  updateUserPermissions,
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

const userId = 'cloud-migration-user';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

// Avoid an unrelated permissions read before exercising the required cloud write.
localStorage.setItem(
  `forge_permissions_${userId}`,
  JSON.stringify({
    userId,
    autonomyLevel: 'L2_GUIDED_AUTONOMY',
    permissionEpoch: 1,
  })
);

await terminate(db);

const requiredCloudWrites: Array<[string, () => Promise<unknown>]> = [
  [
    'permissions',
    () => updateUserPermissions(
      userId,
      'L3_FULL_AUTONOMY',
      { requireCloud: true }
    ),
  ],
  [
    'bodyweight',
    () => saveBodyweight({
      id: 'bw-1',
      userId,
      weight: 82.5,
      date: 1_780_000_000_000,
    }, { requireCloud: true }),
  ],
  [
    'personal record',
    () => savePersonalRecord({
      id: 'pr-1',
      userId,
      exerciseId: 'bench-press',
      weight: 100,
      reps: 5,
      estimated1RM: 116.7,
      workoutId: 'workout-1',
      date: 1_780_000_000_000,
    }, { requireCloud: true }),
  ],
  [
    'target',
    () => saveTarget1RM({
      id: 'target-1',
      userId,
      exerciseId: 'bench-press',
      exerciseName: 'Bench Press',
      target1RM: 120,
      createdAt: 1_780_000_000_000,
      updatedAt: 1_780_000_000_000,
    }, { requireCloud: true }),
  ],
  [
    'plan',
    () => savePlan({
      id: 'plan-1',
      userId,
      name: 'Strength',
      isActive: true,
      weeklyFrequency: 3,
      createdAt: 1_780_000_000_000,
      days: [],
    }, { requireCloud: true }),
  ],
];

const rejected: string[] = [];
for (const [name, write] of requiredCloudWrites) {
  try {
    await write();
  } catch {
    rejected.push(name);
  }
}

assert(
  rejected.length === requiredCloudWrites.length,
  `required migration writes must reject when Firestore rejects; rejected: ${rejected.join(', ') || 'none'}`
);
assert(
  localStorage.getItem(`forge_bw_${userId}`) === null &&
    localStorage.getItem(`forge_prs_${userId}`) === null &&
    localStorage.getItem(`forge_target_1rms_${userId}`) === null &&
    localStorage.getItem(`forge_plans_${userId}`) === null,
  'failed required cloud writes must not create cloud-looking local cache entries'
);

// Existing authenticated flows deliberately retain their local fallback contract.
await savePlan({
  id: 'fallback-plan',
  userId,
  name: 'Offline fallback',
  isActive: true,
  weeklyFrequency: 2,
  createdAt: 1_780_000_000_000,
  days: [],
});
const fallbackPlans = JSON.parse(localStorage.getItem(`forge_plans_${userId}`) || '[]');
assert(
  fallbackPlans.some((plan: any) => plan.id === 'fallback-plan'),
  'ordinary cloud saves must preserve the existing local fallback'
);

console.log('Guest cloud migration required-write regression passed');
