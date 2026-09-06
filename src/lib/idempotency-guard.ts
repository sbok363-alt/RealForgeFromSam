export type IdempotencyStatus = 'NEW' | 'REPLAY' | 'CONFLICT';

export interface IdempotencyEvaluation {
  status: IdempotencyStatus;
  result?: any;
  error?: string;
}

export interface IdempotencyRecord {
  mutationId: string;
  userId: string;
  targetId: string;
  payloadHash: string;
  result: any;
  createdAt: string;
}

/**
 * Normalizes an object into a deterministic JSON string with sorted keys.
 */
export function deterministicStringify(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => deterministicStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `"${k}":${deterministicStringify(obj[k])}`).join(',') + '}';
}

/**
 * Computes a hash representing targetId + payload.
 */
export function hashMutationPayload(targetId: string, payload: any): string {
  const normStr = `${targetId}::${deterministicStringify(payload)}`;
  // DJB2 + FNV1a combination for fast, collision-resistant string hash in any JS environment
  let h1 = 5381;
  let h2 = 2166136261;
  for (let i = 0; i < normStr.length; i++) {
    const char = normStr.charCodeAt(i);
    h1 = ((h1 << 5) + h1) ^ char;
    h2 = (h2 ^ char) * 16777619;
  }
  return `${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

/**
 * Evaluates an idempotency record against incoming request parameters.
 */
export function evaluateIdempotencyRecord(
  existingRecord: IdempotencyRecord | null | undefined,
  currentTargetId: string,
  currentPayloadHash: string
): IdempotencyEvaluation {
  if (!existingRecord) {
    return { status: 'NEW' };
  }

  // If targetId and payloadHash match exactly -> REPLAY of original successful result
  if (
    existingRecord.targetId === currentTargetId &&
    existingRecord.payloadHash === currentPayloadHash
  ) {
    return {
      status: 'REPLAY',
      result: existingRecord.result
    };
  }

  // Idempotency key reused with different target or different payload -> 409 CONFLICT
  return {
    status: 'CONFLICT',
    error: `Idempotency key "${existingRecord.mutationId}" was already used for a different target or payload.`
  };
}
