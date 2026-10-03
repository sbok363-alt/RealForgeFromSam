import { terminate } from 'firebase/firestore';
import { auth, db } from '../src/lib/firebase';
import {
  GUEST_IDENTITY_KEY,
  GUEST_SESSION_KEY,
} from '../src/lib/guest-session';
import { upsertWorkoutForCloudMigration } from '../src/lib/api';
import { Workout } from '../src/types';

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

const guestUid = 'guest-local-matching-cache';
const targetUserId = 'cloud-user-matching-cache';
const workoutId = 'guest-workout-matching-cache';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

localStorage.setItem(GUEST_SESSION_KEY, 'true');
localStorage.setItem(
  GUEST_IDENTITY_KEY,
  JSON.stringify({ uid: guestUid, displayName: 'Guest' })
);

const guestWorkout: Workout = {
  id: workoutId,
  userId: guestUid,
  title: 'Guest Legs',
  scheduledDate: '2026-10-04',
  status: 'COMPLETED',
  version: 3,
  sets: [
    {
      id: 'set-1',
      exercise: 'Leg Press',
      weight: 100,
      reps: 12,
      completed: true,
      setType: 'N',
    },
  ],
  totalVolume: 1200,
  completedAt: 1_780_000_000_000,
};

// The local target-user cache exactly matches Guest content, but the server has no workout.
localStorage.setItem(
  `forge_workouts_${targetUserId}`,
  JSON.stringify([
    {
      ...guestWorkout,
      userId: targetUserId,
      version: 8,
    },
  ])
);

await auth.authStateReady();
const originalCurrentUser = Object.getOwnPropertyDescriptor(auth, 'currentUser');
const originalFetch = globalThis.fetch;
const requests: string[] = [];
let result: Workout | undefined;
let failure: unknown;

try {
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    value: {
      uid: targetUserId,
      getIdToken: async () => 'cloud-token',
      _startProactiveRefresh: () => undefined,
      _stopProactiveRefresh: () => undefined,
    },
  });

  await terminate(db);

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url === `/api/workouts/${workoutId}/mutate`) {
      requests.push('mutate');
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Workout not found' }),
      } as Response;
    }

    if (url === '/api/workouts') {
      requests.push('create');
      return {
        ok: true,
        status: 201,
        json: async () => ({
          workout: {
            ...guestWorkout,
            userId: targetUserId,
            version: 1,
          },
        }),
      } as Response;
    }

    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    result = await upsertWorkoutForCloudMigration(
      guestWorkout,
      targetUserId,
      guestUid
    );
  } catch (error) {
    failure = error;
  }
} finally {
  if (originalCurrentUser) {
    Object.defineProperty(auth, 'currentUser', originalCurrentUser);
  } else {
    delete (auth as any).currentUser;
  }
  globalThis.fetch = originalFetch;
}

assert(!failure, 'matching stale-cache recovery must complete');
assert(
  requests.join(',') === 'mutate,create',
  `matching local cache must not short-circuit authoritative migration; requests: ${requests.join(',') || 'none'}`
);
assert(result?.userId === targetUserId, 'created workout must belong to the target user');
assert(result?.version === 1, 'result must come from authoritative creation, not stale cache');

console.log('Guest migration matching stale-cache regression passed');
