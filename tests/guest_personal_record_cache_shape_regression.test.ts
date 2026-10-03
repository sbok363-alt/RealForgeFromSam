import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getPersonalRecords } from '../src/lib/api';

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

const guestUid = 'guest-local-personal-record-cache-shape';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_prs_${guestUid}`, JSON.stringify([
  { id: 'invalid-pr', userId: guestUid },
  {
    id: 'valid-pr',
    userId: guestUid,
    exerciseId: 'bench-press',
    weight: 80,
    reps: 5,
    estimated1RM: 93,
    workoutId: 'workout-1',
    date: Date.now(),
  },
]));

let records: any[] | undefined;
let failure: unknown;

try {
  records = await getPersonalRecords(guestUid);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'wrong-shape Guest personal-record cache must not crash migration recovery');
assert(Array.isArray(records), 'wrong-shape Guest personal-record cache must recover to an array');
assert(records?.length === 1, `invalid Guest personal-record items must be dropped; got ${JSON.stringify(records)}`);
assert(records?.[0]?.id === 'valid-pr', 'valid Guest personal records must survive item validation');

console.log('Guest personal-record cache shape regression passed');
