import { getFirestore } from 'firebase-admin/firestore';
import { IdempotencyRecord } from '../../lib/idempotency-guard';
import { MutationStorageAdapter, SecureAuditLogEntry } from '../../domain/mutations';

export class FirestoreMutationStorageAdapter implements MutationStorageAdapter {
  private db: any;
  private transaction?: any;

  constructor(db?: any, transaction?: any) {
    this.db = db || getFirestore();
    this.transaction = transaction;
  }

  async findExistingEntity(entityType: string, entityId: string): Promise<Record<string, any> | null> {
    const docRef = this.db.collection(entityType).doc(entityId);
    const snap = this.transaction ? await this.transaction.get(docRef) : await docRef.get();
    if (!snap.exists) return null;
    return snap.data() || null;
  }

  async findIdempotencyRecord(key: string): Promise<(IdempotencyRecord & { auditLogId?: string }) | null> {
    const docRef = this.db.collection('mutation_ids').doc(key);
    const snap = this.transaction ? await this.transaction.get(docRef) : await docRef.get();
    if (!snap.exists) return null;
    return snap.data() || null;
  }

  async recordIdempotency(record: IdempotencyRecord & { auditLogId?: string }): Promise<void> {
    const docRef = this.db.collection('mutation_ids').doc(record.mutationId);
    if (this.transaction) {
      this.transaction.set(docRef, record);
    } else {
      await docRef.set(record);
    }
  }

  async recordAuditLog(entry: SecureAuditLogEntry): Promise<void> {
    const docRef = this.db.collection('mutation_audit_logs').doc(entry.id);
    if (this.transaction) {
      this.transaction.set(docRef, entry);
    } else {
      await docRef.set(entry);
    }
  }

  async commitMutation(entityType: string, entityId: string, data: Record<string, any>): Promise<void> {
    const docRef = this.db.collection(entityType).doc(entityId);
    if (this.transaction) {
      this.transaction.set(docRef, data, { merge: true });
    } else {
      await docRef.set(data, { merge: true });
    }
  }

  async runTransaction<R>(fn: (txAdapter: MutationStorageAdapter) => Promise<R>): Promise<R> {
    if (this.transaction) {
      return await fn(this);
    }
    return await this.db.runTransaction(async (t: any) => {
      const txAdapter = new FirestoreMutationStorageAdapter(this.db, t);
      return await fn(txAdapter);
    });
  }
}
