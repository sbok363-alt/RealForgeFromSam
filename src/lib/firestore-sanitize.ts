/**
 * Firestore rejects undefined values. Normalize mutation payloads at the storage
 * boundary so optional application fields are omitted without changing false,
 * zero, empty strings, or null. Undefined array slots become null to preserve
 * array positions.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function toFirestoreSafe<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : toFirestoreSafe(item)
    ) as T;
  }

  if (isPlainObject(value)) {
    const safe: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) continue;
      safe[key] = toFirestoreSafe(nestedValue);
    }
    return safe as T;
  }

  return value;
}
