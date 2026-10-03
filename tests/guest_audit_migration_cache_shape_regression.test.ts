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
const sourceKey = `forge_audit_logs_${sourceUid}`;
const targetKey = `forge_audit_logs_${targetUid}`;

function audit(id: string, userId: string, targetEntityId: string) {
  return {
    id,
    mutationId: `mutation-${id}`,
    userId,
    actor: 'USER',
    action: 'CREATE',
    mutationType: 'CREATE_WORKOUT',
    targetEntityType: 'WORKOUT',
    targetEntityId,
    baseVersion: 0,
    resultVersion: 1,
    summary: `Audit ${id}`,
    inverseDelta: { deleted: true },
    createdAt: new Date().toISOString(),
  };
}

let sourceShapeFailure: unknown;
let targetShapeFailure: unknown;
let invalidItemFailure: unknown;

try {
  localStorage.setItem(sourceKey, JSON.stringify({ id: 'wrong-source-shape' }));
  localStorage.setItem(targetKey, JSON.stringify([]));

  let migratedFromWrongSource: number | undefined;
  try {
    migratedFromWrongSource = migrateLocalAuditHistory(sourceUid, targetUid);
  } catch (error) {
    sourceShapeFailure = error;
  }

  assert(!sourceShapeFailure, 'wrong-shape Guest audit source must not crash local audit migration');
  assert(migratedFromWrongSource === 0, 'wrong-shape Guest audit source must be treated as an empty history');
  assert(Array.isArray(JSON.parse(localStorage.getItem(targetKey) || 'null')), 'audit migration target must remain an array after source recovery');

  localStorage.setItem(sourceKey, JSON.stringify([
    audit('audit-valid-source', sourceUid, 'workout-valid-source'),
  ]));
  localStorage.setItem(targetKey, JSON.stringify({ id: 'wrong-target-shape' }));

  let migratedFromValidSource: number | undefined;
  try {
    migratedFromValidSource = migrateLocalAuditHistory(sourceUid, targetUid);
  } catch (error) {
    targetShapeFailure = error;
  }

  assert(!targetShapeFailure, 'wrong-shape cloud audit target must not crash local audit migration');
  assert(migratedFromValidSource === 1, 'valid Guest audit history must still migrate when the target cache shape is invalid');
  let migratedTarget = JSON.parse(localStorage.getItem(targetKey) || 'null');
  assert(Array.isArray(migratedTarget), 'audit migration must repair the target cache back to an array');
  assert(migratedTarget.length === 1, 'invalid target history must be dropped while preserving valid Guest audit history');
  assert(migratedTarget[0]?.userId === targetUid, 'migrated audit history must be re-keyed to the cloud user');
  assert(migratedTarget[0]?.storageScope === 'LOCAL_MIGRATED', 'migrated audit history must retain read-only local provenance');

  localStorage.setItem(sourceKey, JSON.stringify([
    null,
    42,
    { id: '' },
    audit('foreign-source-audit', 'guest-local-other', 'workout-foreign-source'),
    audit('audit-valid-source-items', sourceUid, 'workout-valid-source-items'),
  ]));
  localStorage.setItem(targetKey, JSON.stringify([
    null,
    'bad-target-entry',
    { id: '' },
    audit('foreign-target-audit', 'cloud-other-user', 'workout-foreign-target'),
    audit('audit-valid-target-items', targetUid, 'workout-valid-target-items'),
  ]));

  let migratedFromDirtyArrays: number | undefined;
  try {
    migratedFromDirtyArrays = migrateLocalAuditHistory(sourceUid, targetUid);
  } catch (error) {
    invalidItemFailure = error;
  }

  assert(!invalidItemFailure, 'invalid entries inside Guest/cloud audit arrays must not crash local audit migration');
  assert(migratedFromDirtyArrays === 1, 'only the valid Guest audit entry must count as migrated');
  migratedTarget = JSON.parse(localStorage.getItem(targetKey) || 'null');
  assert(Array.isArray(migratedTarget), 'dirty audit-array recovery must leave an array target cache');
  assert(migratedTarget.length === 2, 'dirty audit arrays must retain only valid target + migrated Guest audit entries');
  const ids = migratedTarget.map((entry: any) => entry.id).sort();
  assert(
    JSON.stringify(ids) === JSON.stringify(['audit-valid-source-items', 'audit-valid-target-items']),
    `dirty audit migration preserved unexpected entries: ${JSON.stringify(ids)}`
  );
  const migratedSource = migratedTarget.find((entry: any) => entry.id === 'audit-valid-source-items');
  assert(migratedSource?.userId === targetUid, 'valid Guest audit item must still be re-keyed to the cloud user');
  assert(migratedSource?.storageScope === 'LOCAL_MIGRATED', 'valid Guest audit item must preserve migrated-local provenance');
} finally {
  await terminate(db);
}

console.log('Guest audit migration cache shape regression passed');
