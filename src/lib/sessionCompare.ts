import { Workout, WorkoutSet, WorkoutSetItem } from '../types';
import { extractExerciseHistory } from './progression';

export interface PreviousSetRef {
  weight: number;
  reps: number;
  rir?: number;
  /** Total working volume last session for this exercise */
  sessionVolume: number;
  /** Best e1RM-ish set last session */
  topWeight: number;
  topReps: number;
  date?: string;
}

export interface LiveSetCompare {
  previous: PreviousSetRef | null;
  /** Volume delta of current completed sets vs previous session volume (same exercise) */
  volumeDeltaPct: number | null;
  /** For this set index: weight×reps vs previous set at same index */
  setDeltaPct: number | null;
  label: string; // e.g. "80×8" or "—"
  setBadge: string | null; // e.g. "+6%" or "PR pace"
}

function isCompletedWorkout(w: Workout): boolean {
  return w.status === 'COMPLETED' || w.status === 'completed';
}

/**
 * Last completed session performance for an exercise name/id.
 */
export function getPreviousExerciseSession(
  workouts: Workout[],
  exerciseIdentifier: string,
  excludeWorkoutId?: string
): PreviousSetRef | null {
  const history = extractExerciseHistory(
    workouts.filter((w) => w.id !== excludeWorkoutId),
    exerciseIdentifier
  );
  if (!history.length) return null;
  const last = history[history.length - 1];
  const topSet = last.sets?.[0];
  return {
    weight: last.topWeight,
    reps: last.topReps,
    rir: last.topRIR,
    sessionVolume: last.totalVolume,
    topWeight: last.topWeight,
    topReps: last.topReps,
    date: last.date,
  };
}

/**
 * Previous set at the same set index (0-based), if available.
 */
export function getPreviousSetAtIndex(
  workouts: Workout[],
  exerciseIdentifier: string,
  setIndex: number,
  excludeWorkoutId?: string
): { weight: number; reps: number; rir?: number } | null {
  const history = extractExerciseHistory(
    workouts.filter((w) => w.id !== excludeWorkoutId),
    exerciseIdentifier
  );
  if (!history.length) return null;
  const last = history[history.length - 1];
  const set = last.sets?.[setIndex];
  if (!set || set.weight <= 0) return null;
  return { weight: set.weight, reps: set.reps, rir: set.rir };
}

/**
 * Live comparison for the set currently being logged.
 */
export function compareLiveSet(
  workouts: Workout[],
  exerciseIdentifier: string,
  setIndex: number,
  current: { weight: number; reps: number; completed?: boolean },
  excludeWorkoutId?: string
): LiveSetCompare {
  const prevSession = getPreviousExerciseSession(workouts, exerciseIdentifier, excludeWorkoutId);
  const prevSet = getPreviousSetAtIndex(workouts, exerciseIdentifier, setIndex, excludeWorkoutId);

  const label = prevSet
    ? `${prevSet.weight}×${prevSet.reps}`
    : prevSession
    ? `${prevSession.topWeight}×${prevSession.topReps}`
    : '—';

  let setDeltaPct: number | null = null;
  if (prevSet && current.weight > 0 && current.reps > 0) {
    const prevVol = prevSet.weight * prevSet.reps;
    const curVol = current.weight * current.reps;
    if (prevVol > 0) {
      const raw = ((curVol - prevVol) / prevVol) * 100;
      setDeltaPct = Math.round(Math.max(-99, Math.min(200, raw)) * 10) / 10;
    }
  }

  return {
    previous: prevSession,
    volumeDeltaPct: null, // filled at exercise level if needed
    setDeltaPct,
    label,
    setBadge:
      setDeltaPct === null
        ? null
        : setDeltaPct > 0
        ? `+${setDeltaPct}%`
        : setDeltaPct < 0
        ? `${setDeltaPct}%`
        : '=',
  };
}

/**
 * Running volume for an exercise within the active session (completed sets only).
 */
export function currentExerciseVolume(
  sets: Array<{ weight: number; reps: number; completed?: boolean }>
): number {
  return sets.reduce((sum, s) => {
    if (s.completed === false) return sum;
    if (s.weight > 0 && s.reps > 0) return sum + s.weight * s.reps;
    return sum;
  }, 0);
}

export function volumeDeltaPct(currentVol: number, previousVol: number): number | null {
  if (!previousVol || previousVol <= 0) return null;
  return Math.round(((currentVol - previousVol) / previousVol) * 1000) / 10;
}
