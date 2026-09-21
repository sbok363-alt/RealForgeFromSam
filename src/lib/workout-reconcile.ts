import { Workout } from '../types';

export function reconcileAuthoritativeWorkout(
  local: Workout,
  authoritative: Workout,
  capturedRevision: number,
  currentRevision: number
): Workout {
  if (currentRevision <= capturedRevision) {
    return authoritative;
  }

  return {
    ...authoritative,
    ...local,
    id: authoritative.id,
    userId: authoritative.userId ?? local.userId,
    version: authoritative.version,
    updatedAt: authoritative.updatedAt,
    createdAt: authoritative.createdAt ?? local.createdAt,
  };
}
