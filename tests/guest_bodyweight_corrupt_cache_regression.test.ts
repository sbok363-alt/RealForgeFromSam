import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getBodyweight } from '../src/lib/api';

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

const guestUid = 'guest-local-corrupt-bodyweight-cache';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_bw_${guestUid}`, '{corrupt-json');

let entries: any[] | undefined;
let failure: unknown;

try {
  entries = await getBodyweight(guestUid);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'corrupt Guest bodyweight cache must not crash progress recovery');
assert(Array.isArray(entries), 'corrupt Guest bodyweight cache must recover to an array');
assert(entries?.length === 0, 'corrupt Guest bodyweight cache must recover to an empty entry list');

console.log('Guest corrupt bodyweight cache regression passed');
