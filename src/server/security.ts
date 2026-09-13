import { z } from 'zod';
import { createHash } from 'node:crypto';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const documentId = z.string().trim().min(1).max(128).refine(v => !/[\\/\u0000-\u001f\u007f]/.test(v) && v !== '.' && v !== '..', 'Invalid document ID');
export const versionInput = z.number().int().nonnegative();
export function versionOf(value: any): number {
  const version = value.version === undefined ? 0 : value.version;
  if (!Number.isSafeInteger(version) || version < 0) throw new ApiError(409, 'Stored version is invalid');
  return version;
}
export function own(value: any, uid: string) {
  if (!value || value.userId !== uid) throw new ApiError(403, 'Unauthorized');
}
export function canonical(value: any): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new ApiError(400, 'Invalid property');
      return `${JSON.stringify(k)}:${canonical(value[k])}`;
    }).join(',')}}`;
  }
  throw new ApiError(400, 'Only finite JSON values are supported');
}
export function digest(value: any) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function clean(value: any): any {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  return value;
}
export function replay(record: any, uid: string, operation: string, hash: string) {
  if (!record) return undefined;
  if (record.userId !== uid || record.schemaVersion !== 2 || record.operation !== operation || record.payloadHash !== hash) throw new ApiError(409, 'Mutation key requires reconciliation');
  return record.result;
}
