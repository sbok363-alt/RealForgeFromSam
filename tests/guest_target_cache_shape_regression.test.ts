import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getTarget1RMs } from '../src/lib/api';

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

const guestUid = 'guest-local-target-cache-shape';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_target_1rms_${guestUid}`, JSON.stringify([
  { id: 'invalid-target', userId: guestUid },
  {
    id: 'valid-target',
    userId: guestUid,
    exerciseId: 'bench-press',
    exerciseName: 'Bench Press',
    target1RM: 100,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]));

let targets: any[] | undefined;
let failure: unknown;

try {
  targets = await getTarget1RMs(guestUid);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'wrong-shape Guest target cache must not crash progress or migration recovery');
assert(Array.isArray(targets), 'wrong-shape Guest target cache must recover to an array');
assert(targets?.length === 1, `invalid Guest target items must be dropped; got ${JSON.stringify(targets)}`);
assert(targets?.[0]?.id === 'valid-target', 'valid Guest targets must survive item validation');

console.log('Guest target cache shape regression passed');
