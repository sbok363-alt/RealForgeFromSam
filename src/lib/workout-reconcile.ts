import { Workout } from '../types';

const LOCAL_MUTABLE_FIELDS: (keyof Workout)[] = [
  'title','scheduledDate','status','sets','exercises','notes','exerciseNotes',
  'startedAt','completedAt','totalVolume','volume','duration'
];

export function reconcileAuthoritativeWorkout(
  local: Workout,
  authoritative: Workout,
  capturedRevision: number,
  currentRevision: number
): Workout {
  if (currentRevision <= capturedRevision) return authoritative;

  const merged: Workout = { ...authoritative };
  for (const field of LOCAL_MUTABLE_FIELDS) {
    if (local[field] !== undefined) (merged as any)[field] = local[field];
  }
  merged.id = authoritative.id;
  merged.userId = authoritative.userId;
  merged.version = authoritative.version;
  merged.createdAt = authoritative.createdAt;
  merged.updatedAt = authoritative.updatedAt;
  return merged;
}
