import { createHash } from 'node:crypto';
import { canonical } from '../server/security';

export type IdempotencyStatus = 'NEW' | 'REPLAY' | 'CONFLICT';
export interface IdempotencyEvaluation { status: IdempotencyStatus; result?: any; error?: string; }
export interface IdempotencyRecord { mutationId: string; userId: string; targetId: string; payloadHash: string; result: any; createdAt: string; schemaVersion?: number; operation?: string; }

export function deterministicStringify(value: any): string {
  return canonical(value);
}

export function hashMutationPayload(targetId: string, payload: any): string {
  return createHash('sha256').update(`${targetId}::${deterministicStringify(payload)}`, 'utf8').digest('hex');
}

export function evaluateIdempotencyRecord(existingRecord: IdempotencyRecord | null | undefined, currentTargetId: string, currentPayloadHash: string, currentUserId?: string): IdempotencyEvaluation {
  if (!existingRecord) return { status: 'NEW' };
  if (!currentUserId || existingRecord.userId !== currentUserId) return { status: 'CONFLICT', error: 'Mutation key belongs to another user session.' };
  if (existingRecord.schemaVersion !== 2) return { status: 'CONFLICT', error: 'Legacy mutation key requires reconciliation.' };
  if (existingRecord.targetId === currentTargetId && existingRecord.payloadHash === currentPayloadHash) return { status: 'REPLAY', result: existingRecord.result };
  return { status: 'CONFLICT', error: `Idempotency key "${existingRecord.mutationId}" was already used for a different target or payload.` };
}
