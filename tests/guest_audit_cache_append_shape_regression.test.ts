import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { saveWorkout } from '../src/lib/api';

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

const guestUid = 'guest-local-audit-cache-shape';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;
localStorage.setItem(`forge_audit_logs_${guestUid}`, JSON.stringify({ id: 'wrong-shape-audit' }));

let failure: unknown;
try {
  await saveWorkout({
    id: 'workout-audit-shape-recovery',
    userId: guestUid,
    title: 'Audit shape recovery',
    scheduledDate: '2026-10-03',
    status: 'PLANNED',
    version: 1,
    sets: [],
    exercises: [],
    updatedAt: new Date().toISOString(),
  } as any);
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, 'wrong-shape Guest audit cache must not make a local workout save fail');
const auditCache = JSON.parse(localStorage.getItem(`forge_audit_logs_${guestUid}`) || 'null');
assert(Array.isArray(auditCache), 'saving a Guest workout must repair the audit cache back to an array');
assert(auditCache.length === 1, 'wrong-shape prior audit data must be dropped while preserving the new audit event');
assert(auditCache[0]?.targetEntityId === 'workout-audit-shape-recovery', 'new workout audit event must be preserved after cache recovery');

console.log('Guest audit-cache append shape regression passed');
