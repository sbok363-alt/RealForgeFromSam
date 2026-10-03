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
const auditKey = `forge_audit_logs_${guestUid}`;
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

function workout(id: string) {
  return {
    id,
    userId: guestUid,
    title: 'Audit shape recovery',
    scheduledDate: '2026-10-03',
    status: 'PLANNED',
    version: 1,
    sets: [],
    exercises: [],
    updatedAt: new Date().toISOString(),
  } as any;
}

let wrongOuterShapeFailure: unknown;
let invalidItemFailure: unknown;
try {
  localStorage.setItem(auditKey, JSON.stringify({ id: 'wrong-shape-audit' }));
  try {
    await saveWorkout(workout('workout-audit-shape-recovery'));
  } catch (error) {
    wrongOuterShapeFailure = error;
  }

  let auditCache = JSON.parse(localStorage.getItem(auditKey) || 'null');
  assert(!wrongOuterShapeFailure, 'wrong-shape Guest audit cache must not make a local workout save fail');
  assert(Array.isArray(auditCache), 'saving a Guest workout must repair the audit cache back to an array');
  assert(auditCache.length === 1, 'wrong-shape prior audit data must be dropped while preserving the new audit event');
  assert(auditCache[0]?.targetEntityId === 'workout-audit-shape-recovery', 'new workout audit event must be preserved after cache recovery');

  localStorage.setItem(auditKey, JSON.stringify([null, 42, { id: '' }, { id: 'foreign-audit', userId: 'guest-local-other' }]));
  try {
    await saveWorkout(workout('workout-audit-item-recovery'));
  } catch (error) {
    invalidItemFailure = error;
  }

  auditCache = JSON.parse(localStorage.getItem(auditKey) || 'null');
  assert(!invalidItemFailure, 'invalid entries inside a Guest audit array must not make a local workout save fail');
  assert(Array.isArray(auditCache), 'audit item recovery must leave an array cache');
  assert(auditCache.length === 1, 'invalid or foreign prior audit entries must be dropped while preserving the new audit event');
  assert(auditCache[0]?.targetEntityId === 'workout-audit-item-recovery', 'new audit event must survive invalid-item recovery');
} finally {
  await terminate(db);
}

console.log('Guest audit-cache append shape regression passed');
