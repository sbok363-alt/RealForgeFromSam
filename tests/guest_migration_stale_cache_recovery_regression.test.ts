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

const guestUid = 'guest-local-stale-cache';
const targetUserId = 'cloud-user-stale-cache';
const workoutId = 'guest-workout-stale-cache';
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
  title: 'Guest Pull Day',
  scheduledDate: '2026-10-03',
  status: 'COMPLETED',
  version: 3,
  sets: [
    {
      id: 'set-1',
      exercise: 'Pull-Up',
      weight: 0,
      reps: 10,
      completed: true,
      setType: 'N',
    },
  ],
  totalVolume: 0,
  completedAt: 1_780_000_000_000,
};

// This cache entry is not authoritative: Firestore/server no longer has the workout.
localStorage.setItem(
  `forge_workouts_${targetUserId}`,
  JSON.stringify([
    {
      ...guestWorkout,
      userId: targetUserId,
      title: 'Stale cached title',
      version: 8,
    },
  ])
);

await auth.authStateReady();
const originalCurrentUser = Object.getOwnPropertyDescriptor(auth, 'currentUser');
const originalFetch = globalThis.fetch;
const requests: string[] = [];
let createdMutationId: string | undefined;
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

  // Force getWorkout() onto its local fallback, reproducing a stale target-user cache.
  await terminate(db);

  globalThis.fetch = (async (input, init) => {
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
      const body = JSON.parse(String(init?.body || '{}'));
      createdMutationId = body.mutationId;
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

assert(
  !failure,
  `a stale local cache must recover through authoritative create after update 404; got ${failure instanceof Error ? failure.message : String(failure)}`
);
assert(
  requests.join(',') === 'mutate,create',
  `migration must retry the missing authoritative workout as a create; requests: ${requests.join(',')}`
);
assert(
  createdMutationId ===
    `guest-migration:create:${guestUid}:${targetUserId}:${workoutId}:v3`,
  '404 recovery must reuse the deterministic migration create identity'
);
assert(result?.userId === targetUserId, 'recovered cloud workout must belong to the target user');
assert(result?.title === guestWorkout.title, 'recovered cloud workout must contain Guest truth');
assert(result?.version === 1, 'authoritative create result must be returned');

console.log('Guest migration stale-cache recovery regression passed');
