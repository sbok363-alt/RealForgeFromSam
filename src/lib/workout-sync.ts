import { Workout } from '../types';

/** Acknowledgement advances the server version without replacing edits made after dispatch. */
export function acknowledgeWorkout(current: Workout | null, sent: Workout, response: Workout): Workout | null {
  if (!current || current.id !== sent.id || current.userId !== sent.userId || response.id !== sent.id || response.userId !== sent.userId) return current;
  if (current.version !== sent.version) return current;
  return current === sent ? response : { ...current, version: response.version };
}
