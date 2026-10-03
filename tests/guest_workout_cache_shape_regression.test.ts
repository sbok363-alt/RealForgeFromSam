import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getWorkouts } from '../src/lib/api';

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

const guestUid = 'guest-local-wrong-shape-workout-cache';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_workouts_${guestUid}`, '{}');

let workouts: any;
let failure: unknown;

try {
  workouts = await getWorkouts(guestUid);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'wrong-shape Guest workout cache must not crash recovery');
assert(Array.isArray(workouts), 'wrong-shape Guest workout cache must recover to an array');
assert(workouts.length === 0, 'wrong-shape Guest workout cache must recover to an empty workout list');

console.log('Guest workout cache shape regression passed');
