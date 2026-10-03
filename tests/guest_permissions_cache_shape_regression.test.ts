import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getUserPermissions } from '../src/lib/api';

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

const guestUid = 'guest-local-permissions-cache-shape';
const key = `forge_permissions_${guestUid}`;
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

async function assertRecovered(raw: unknown, label: string) {
  localStorage.setItem(key, JSON.stringify(raw));
  const permissions = await getUserPermissions(guestUid);
  assert(permissions.userId === guestUid, `${label}: recovered permissions must be keyed to the Guest user`);
  assert(permissions.autonomyLevel === 'L2_GUIDED_AUTONOMY', `${label}: invalid permissions must recover to the safe default autonomy level`);
  assert(permissions.permissionEpoch === 1, `${label}: invalid permissions must recover to the initial permission epoch`);
  const cached = JSON.parse(localStorage.getItem(key) || 'null');
  assert(cached?.userId === guestUid, `${label}: recovery must repair the cached permissions object`);
  assert(cached?.autonomyLevel === 'L2_GUIDED_AUTONOMY', `${label}: repaired cache must preserve a valid autonomy level`);
}

let failure: unknown;
try {
  await assertRecovered([], 'array shape');
  await assertRecovered({}, 'missing fields');
  await assertRecovered({ userId: guestUid, autonomyLevel: 'INVALID_LEVEL', permissionEpoch: 1 }, 'invalid autonomy');
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, `wrong-shape Guest permissions cache must recover instead of blocking Google migration: ${String(failure)}`);
console.log('Guest permissions cache shape regression passed');
