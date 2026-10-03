import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { migrateLocalAuditHistory } from '../src/lib/api';

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

const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

const sourceUid = 'guest-local-audit-migration-shape';
const targetUid = 'cloud-audit-migration-shape';

let sourceShapeFailure: unknown;
let migratedFromWrongSource: number | undefined;
localStorage.setItem(`forge_audit_logs_${sourceUid}`, JSON.stringify({ id: 'wrong-source-shape' }));
localStorage.setItem(`forge_audit_logs_${targetUid}`, JSON.stringify([]));
try {
  migratedFromWrongSource = migrateLocalAuditHistory(sourceUid, targetUid);
} catch (error) {
  sourceShapeFailure = error;
}

assert(!sourceShapeFailure, 'wrong-shape Guest audit source must not crash local audit migration');
assert(migratedFromWrongSource === 0, 'wrong-shape Guest audit source must be treated as an empty history');
assert(Array.isArray(JSON.parse(localStorage.getItem(`forge_audit_logs_${targetUid}`) || 'null')), 'audit migration target must remain an array after source recovery');

localStorage.setItem(`forge_audit_logs_${sourceUid}`, JSON.stringify([{
  id: 'audit-valid-source',
  mutationId: 'mutation-valid-source',
  userId: sourceUid,
  actor: 'USER',
  action: 'CREATE',
  mutationType: 'CREATE_WORKOUT',
  targetEntityType: 'WORKOUT',
  targetEntityId: 'workout-valid-source',
  baseVersion: 0,
  resultVersion: 1,
  summary: 'Valid source audit',
  inverseDelta: { deleted: true },
  createdAt: new Date().toISOString(),
}]));
localStorage.setItem(`forge_audit_logs_${targetUid}`, JSON.stringify({ id: 'wrong-target-shape' }));

let targetShapeFailure: unknown;
let migratedFromValidSource: number | undefined;
try {
  migratedFromValidSource = migrateLocalAuditHistory(sourceUid, targetUid);
} catch (error) {
  targetShapeFailure = error;
} finally {
  await terminate(db);
}

assert(!targetShapeFailure, 'wrong-shape cloud audit target must not crash local audit migration');
assert(migratedFromValidSource === 1, 'valid Guest audit history must still migrate when the target cache shape is invalid');
const migratedTarget = JSON.parse(localStorage.getItem(`forge_audit_logs_${targetUid}`) || 'null');
assert(Array.isArray(migratedTarget), 'audit migration must repair the target cache back to an array');
assert(migratedTarget.length === 1, 'invalid target history must be dropped while preserving valid Guest audit history');
assert(migratedTarget[0]?.userId === targetUid, 'migrated audit history must be re-keyed to the cloud user');
assert(migratedTarget[0]?.storageScope === 'LOCAL_MIGRATED', 'migrated audit history must retain read-only local provenance');

console.log('Guest audit migration cache shape regression passed');
