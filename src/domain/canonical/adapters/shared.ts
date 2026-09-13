import { z } from 'zod';
import { CalendarDateSchema, IdSchema, InstantSchema } from '../common';

export interface AdapterIssue { path: string; code: string; message: string }
export type AdapterResult<T> =
  | { success: true; data: T; issues: AdapterIssue[] }
  | { success: false; issues: AdapterIssue[] };

// Context must come from an authorized read. It does not authorize a read/write.
export const ReadScopeSchema = z.object({ userId: IdSchema, documentId: IdSchema.optional() }).strict();
export type ReadScope = z.infer<typeof ReadScopeSchema>;

export function issue(issues: AdapterIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}
export function invalid(path: string, message: string): never {
  throw new z.ZodError([{ code: 'custom', path: [path], message }]);
}
export function adapt<T>(convert: (issues: AdapterIssue[]) => T): AdapterResult<T> {
  const issues: AdapterIssue[] = [];
  try { return { success: true, data: convert(issues), issues }; }
  catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return { success: false, issues: [...issues, ...error.issues.map(item => ({
      path: item.path.join('.'), code: item.code, message: item.message,
    }))] };
  }
}

export function identity(raw: { id?: string; userId?: string }, context: ReadScope, issues: AdapterIssue[]) {
  const scope = ReadScopeSchema.parse(context);
  if (raw.userId !== undefined && raw.userId !== scope.userId) invalid('userId', 'Record owner differs from read scope');
  if (scope.documentId && raw.id && scope.documentId !== raw.id) invalid('id', 'Record ID differs from document ID');
  const id = IdSchema.parse(scope.documentId ?? raw.id);
  if (raw.userId === undefined) issue(issues, 'userId', 'scoped_owner', 'Missing owner supplied by authorized read context');
  return { id, userId: scope.userId };
}

// Only decimal numeric strings are accepted at the legacy boundary, never booleans,
// blanks, null, hex or arbitrary JavaScript coercion. Canonical schemas do not coerce.
export const LegacyNumberSchema = z.preprocess(value =>
  typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()) ? Number(value) : value,
z.number().finite());
export function nullableOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess(value => value === null ? undefined : value, schema.optional());
}
export const LegacyInstantSchema = z.union([
  z.number().int().min(0).max(8640000000000000).transform(value => new Date(value).toISOString()),
  InstantSchema.transform(value => new Date(value).toISOString()),
  CalendarDateSchema.transform(value => `${value}T00:00:00.000Z`),
]);
