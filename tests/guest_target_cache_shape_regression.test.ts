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
localStorage.setItem(`forge_target_1rms_${guestUid}`, JSON.stringify({ id: 'target-1', exerciseId: 'bench-press', target1RM: 100 }));

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
assert(targets?.length === 0, 'wrong-shape Guest target cache must recover to an empty target list');

console.log('Guest target cache shape regression passed');
