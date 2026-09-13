import type { ExerciseReference, SetPerformance } from '../canonical';

/** A diagnostic emitted while adapting or analysing a read-only record. */
export interface AnalyticsDiagnostic {
  code: string;
  message: string;
  severity: 'warning' | 'failure';
  path?: string;
  sessionId?: string;
  exerciseIdentifier?: string;
}

export interface AnalyticsResult<T> {
  data: T;
  diagnostics: AnalyticsDiagnostic[];
}

/**
 * Immutable computation input derived from canonical SetPerformance. The
 * exercise reference is attached only for analytics identity resolution; it
 * is not a second persisted set schema.
 */
export type CanonicalHistorySet = SetPerformance & {
  readonly exercise: ExerciseReference;
};

export interface CanonicalExerciseHistorySession {
  workoutId: string;
  workoutTitle: string;
  date: string;
  timestamp: number;
  topWeight: number;
  topReps: number;
  topRIR?: number;
  topRPE?: number;
  maxE1RM: number;
  totalVolume: number;
  setsCount: number;
  sets: CanonicalHistorySet[];
}

export type CanonicalProgressionState = 'PROGRESSING' | 'STALLING' | 'REGRESSING' | 'INSUFFICIENT_DATA';

export interface CanonicalNextSessionTarget {
  targetWeight: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets?: number;
  suggestedRIR?: number;
  action: 'INCREASE_WEIGHT' | 'INCREASE_REPS' | 'MAINTAIN' | 'DELOAD' | 'BASELINE';
  rationale: string;
}

export interface CanonicalProgressionReport {
  exerciseId: string;
  exerciseName: string;
  state: CanonicalProgressionState;
  currentE1RM: number;
  previousE1RM: number;
  deltaE1RM: number;
  percentageDelta: number;
  recentSessionsCount: number;
  lastPerformance?: {
    date: string;
    weight: number;
    reps: number;
    rir?: number;
    rpe?: number;
    e1RM: number;
    volume: number;
  };
  history: {
    date: string;
    totalVolume: number;
    sets: { weight: number; reps: number; rir?: number }[];
  }[];
  summary: string;
  rationales: string[];
  nextTarget: CanonicalNextSessionTarget;
}

export interface CanonicalAnalyticsOptions {
  /** Receive diagnostics without changing the historical return shape. */
  onDiagnostic?: (diagnostic: AnalyticsDiagnostic) => void;
}
