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
const cacheKey = `forge_bw_${guestUid}`;
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

let malformedEntries: any[] | undefined;
let malformedFailure: unknown;
let wrongShapeEntries: any[] | undefined;
let wrongShapeFailure: unknown;
let invalidItemEntries: any[] | undefined;
let invalidItemFailure: unknown;

try {
  localStorage.setItem(cacheKey, '{corrupt-json');
  try {
    malformedEntries = await getBodyweight(guestUid);
  } catch (error) {
    malformedFailure = error;
  }

  localStorage.setItem(cacheKey, JSON.stringify({ weight: 53, date: Date.now() }));
  try {
    wrongShapeEntries = await getBodyweight(guestUid);
  } catch (error) {
    wrongShapeFailure = error;
  }

  localStorage.setItem(cacheKey, JSON.stringify([
    { id: 'missing-bodyweight-fields', userId: guestUid },
    { id: 'valid-bodyweight', userId: guestUid, weight: 53, date: Date.now() },
  ]));
  try {
    invalidItemEntries = await getBodyweight(guestUid);
  } catch (error) {
    invalidItemFailure = error;
  }
} finally {
  await terminate(db);
}

assert(!malformedFailure, 'corrupt Guest bodyweight cache must not crash progress recovery');
assert(Array.isArray(malformedEntries), 'corrupt Guest bodyweight cache must recover to an array');
assert(malformedEntries?.length === 0, 'corrupt Guest bodyweight cache must recover to an empty entry list');

assert(!wrongShapeFailure, 'wrong-shape Guest bodyweight cache must not crash progress or migration recovery');
assert(Array.isArray(wrongShapeEntries), 'wrong-shape Guest bodyweight cache must recover to an array');
assert(wrongShapeEntries?.length === 0, 'wrong-shape Guest bodyweight cache must recover to an empty entry list');

assert(!invalidItemFailure, 'invalid Guest bodyweight entries must not crash progress or migration recovery');
assert(invalidItemEntries?.length === 1, `invalid Guest bodyweight entries must be dropped; got ${JSON.stringify(invalidItemEntries)}`);
assert(invalidItemEntries?.[0]?.id === 'valid-bodyweight', 'valid Guest bodyweight entries must survive item validation');

console.log('Guest bodyweight corrupt/shape regression passed');
