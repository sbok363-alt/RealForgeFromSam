import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getPlans } from '../src/lib/api';

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

const guestUid = 'guest-local-corrupt-plan-cache';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_plans_${guestUid}`, '{corrupt-json');

let plans: any[] | undefined;
let failure: unknown;

try {
  plans = await getPlans(guestUid);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'corrupt Guest plan cache must not crash plan recovery');
assert(Array.isArray(plans), 'corrupt Guest plan cache must recover to an array');
assert(plans?.length === 0, 'corrupt Guest plan cache must recover to an empty plan list');

console.log('Guest corrupt plan cache regression passed');
