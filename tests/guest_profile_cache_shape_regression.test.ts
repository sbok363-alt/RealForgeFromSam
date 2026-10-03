import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getUserProfile } from '../src/lib/api';
import { guestProfileKey } from '../src/lib/guest-session';

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

const guestUid = 'guest-local-profile-cache-shape';
const key = guestProfileKey(guestUid);
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

let failure: unknown;
try {
  localStorage.setItem(key, JSON.stringify([]));
  assert(await getUserProfile(guestUid) === null, 'array-shaped Guest profile cache must be rejected');

  localStorage.setItem(key, JSON.stringify({}));
  assert(await getUserProfile(guestUid) === null, 'Guest profile cache missing required identity must be rejected');

  localStorage.setItem(key, JSON.stringify({ userId: 'guest-local-other', createdAt: Date.now() }));
  assert(await getUserProfile(guestUid) === null, 'Guest profile cache for a different user must be rejected');

  localStorage.setItem(key, JSON.stringify({ userId: guestUid, createdAt: 'not-a-number' }));
  assert(await getUserProfile(guestUid) === null, 'Guest profile cache with invalid creation timestamp must be rejected');

  const valid = { userId: guestUid, name: 'Guest', createdAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(valid));
  const recovered = await getUserProfile(guestUid);
  assert(recovered?.userId === guestUid, 'valid Guest profile cache must remain readable');
  assert(recovered?.createdAt === valid.createdAt, 'valid Guest profile creation timestamp must be preserved');
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, `Guest profile cache validation regression failed: ${String(failure)}`);
console.log('Guest profile cache shape regression passed');
