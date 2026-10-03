import { auth } from '../src/lib/firebase';
import { GUEST_IDENTITY_KEY, GUEST_SESSION_KEY } from '../src/lib/guest-session';
import { mutateWorkout } from '../src/lib/api';
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

const guestUid = 'guest-local-migration-autosync';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

localStorage.setItem(GUEST_SESSION_KEY, 'true');
localStorage.setItem(
  GUEST_IDENTITY_KEY,
  JSON.stringify({ uid: guestUid, displayName: 'Guest' })
);

const guestWorkout: Workout = {
  id: 'guest-workout-1',
  userId: guestUid,
  title: 'Guest Push Day',
  scheduledDate: '2026-10-03',
  status: 'IN_PROGRESS',
  version: 1,
  sets: [
    {
      id: 'set-1',
      exercise: 'Bench Press',
      weight: 60,
      reps: 8,
      completed: false,
      setType: 'N',
    },
  ],
};

localStorage.setItem(
  `forge_workouts_${guestUid}`,
  JSON.stringify([guestWorkout])
);

const originalCurrentUser = Object.getOwnPropertyDescriptor(auth, 'currentUser');
const originalFetch = globalThis.fetch;
let cloudRequests = 0;
let rejectCloudRequest = false;
let explicitCloudBoundaryReached = false;
let autosyncCloudRequests = 0;
let migrationCloudRequests = 0;
let result: Workout | undefined;

try {
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    value: {
      uid: 'cloud-user',
      getIdToken: async () => 'cloud-token',
      _startProactiveRefresh: () => undefined,
      _stopProactiveRefresh: () => undefined,
    },
  });

  globalThis.fetch = (async () => {
    cloudRequests += 1;
    if (rejectCloudRequest) {
      throw new Error('EXPECTED_CLOUD_BOUNDARY');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        workout: {
          ...guestWorkout,
          userId: 'cloud-user',
          title: 'Cloud result',
          version: 99,
        },
      }),
    } as Response;
  }) as typeof fetch;

  result = await mutateWorkout(
    guestWorkout.id,
    guestWorkout.version,
    {
      sets: [
        {
          ...guestWorkout.sets[0],
          completed: true,
        },
      ],
    },
    {
      mutationId: 'migration-autosync-1',
      duration: 60,
      volume: 480,
    }
  );
  autosyncCloudRequests = cloudRequests;

  cloudRequests = 0;
  rejectCloudRequest = true;
  try {
    await mutateWorkout(
      guestWorkout.id,
      guestWorkout.version,
      { title: 'Explicit cloud migration update' },
      {
        mutationId: 'migration-cloud-write-1',
        forceCloud: true,
      }
    );
  } catch (error) {
    explicitCloudBoundaryReached =
      error instanceof Error && error.message === 'EXPECTED_CLOUD_BOUNDARY';
  }
  migrationCloudRequests = cloudRequests;
} finally {
  if (originalCurrentUser) {
    Object.defineProperty(auth, 'currentUser', originalCurrentUser);
  } else {
    delete (auth as any).currentUser;
  }
  globalThis.fetch = originalFetch;
}

assert(
  autosyncCloudRequests === 0,
  'an active Guest session must keep workout autosync local while Firebase authentication exists during migration'
);
assert(result?.userId === guestUid, 'local Guest ownership must survive migration-time autosync');
assert(result?.version === 2, 'local Guest mutation must advance the local OCC version exactly once');
assert(result?.sets[0].completed === true, 'local Guest mutation must persist the updated set');
assert(
  migrationCloudRequests === 1 && explicitCloudBoundaryReached,
  'an explicit cloud-migration update must bypass Guest-local routing'
);
