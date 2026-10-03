import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { getMutationAuditLogs } from '../src/lib/api';

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

const guestUid = 'guest-local-audit-read-shape';
const localStorage = new MemoryStorage();
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

function audit(id: string, createdAt: string, userId?: string) {
  return {
    id,
    mutationId: `mutation-${id}`,
    ...(userId === undefined ? {} : { userId }),
    actor: 'USER',
    action: 'CREATE',
    mutationType: 'CREATE_WORKOUT',
    targetEntityType: 'WORKOUT',
    targetEntityId: `workout-${id}`,
    baseVersion: 0,
    resultVersion: 1,
    summary: `Audit ${id}`,
    inverseDelta: { deleted: true },
    createdAt,
  };
}

localStorage.setItem(
  `forge_audit_logs_${guestUid}`,
  JSON.stringify([
    null,
    42,
    'bad-entry',
    [],
    {},
    { id: '' },
    audit('foreign-audit', '2026-10-03T09:02:00.000Z', 'guest-local-other'),
    audit('legacy-audit', '2026-10-03T09:00:00.000Z'),
    audit('owned-audit', '2026-10-03T09:01:00.000Z', guestUid),
  ])
);

let failure: unknown;
try {
  const logs = await getMutationAuditLogs(guestUid);
  const ids = logs.map((log) => log.id);
  assert(
    JSON.stringify(ids) === JSON.stringify(['owned-audit', 'legacy-audit']),
    `Guest audit reader must preserve valid owned/legacy history while dropping malformed or foreign entries; got ${JSON.stringify(ids)}`
  );
  assert(
    logs.every((log) => log.storageScope === 'LOCAL'),
    'recovered Guest audit history must retain local provenance'
  );
} catch (error) {
  failure = error;
} finally {
  await terminate(db);
}

assert(!failure, `Guest audit read cache-shape regression failed: ${String(failure)}`);
console.log('Guest audit read cache-shape regression passed');
