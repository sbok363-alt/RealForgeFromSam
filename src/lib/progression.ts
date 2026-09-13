import type { Workout, WorkoutSetItem, ProgressionReport } from '../types';
import {
  analyzeExerciseProgressionFromCanonicalResult,
  calculateE1RM as calculateCanonicalE1RM,
  extractExerciseHistoryFromCanonicalResult,
  adaptLegacyWorkoutsForAnalytics,
  normalizeExerciseIdentifier,
  resolveAnalyticsExercise,
  type AnalyticsDiagnostic,
  type AnalyticsResult,
  type CanonicalHistorySet,
  type LegacyAnalyticsAdapterOptions,
  type LegacySetSource,
} from '../domain/analytics/index';

/** Public compatibility shape retained for existing application callers. */
export interface SessionExercisePerformance {
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
  sets: WorkoutSetItem[];
}

export interface LegacyAnalyticsOptions extends LegacyAnalyticsAdapterOptions {
  onDiagnostic?: (diagnostic: AnalyticsDiagnostic) => void;
}

/** Existing public math entry point, now backed by the canonical policy. */
export function calculateE1RM(weight: number, reps: number, rir?: number | null): number {
  return calculateCanonicalE1RM(weight, reps, rir);
}

function emitDiagnostics(diagnostics: readonly AnalyticsDiagnostic[], options?: LegacyAnalyticsOptions): void {
  diagnostics.forEach(item => options?.onDiagnostic?.(item));
}

function mergeDiagnostics(...groups: readonly AnalyticsDiagnostic[][]): AnalyticsDiagnostic[] {
  const seen = new Set<string>();
  const result: AnalyticsDiagnostic[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = [item.code, item.severity, item.sessionId ?? '', item.exerciseIdentifier ?? '', item.path ?? ''].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function canonicalExerciseIdentifier(set: CanonicalHistorySet): string {
  return set.exercise.kind === 'catalog' ? set.exercise.exerciseId : set.exercise.legacyIdentifier;
}

function canonicalExerciseKey(set: CanonicalHistorySet): string {
  if (set.exercise.kind === 'catalog') return `catalog:${set.exercise.exerciseId}`;
  return `unresolved:${normalizeExerciseIdentifier(set.exercise.legacyIdentifier)}:${normalizeExerciseIdentifier(set.exercise.label)}`;
}

/**
 * Set IDs are only unique within a canonical exercise performance. Legacy
 * nested records can therefore reuse an ID across exercises. Filter the
 * presentation candidates by canonical identity before selecting a source so
 * the compatibility projection cannot return another exercise's raw set.
 */
function sourceMatchesExercise(source: LegacySetSource, set: CanonicalHistorySet): boolean {
  const sourceResolution = resolveAnalyticsExercise(source.exerciseIdentifier);
  // A nested legacy record can carry an opaque exerciseId alongside a known
  // display name. Resolve that label as a compatibility fallback while
  // retaining the raw identifier for the legacy presentation projection.
  const resolved = sourceResolution.kind === 'unresolved' && source.exerciseLabel
    ? resolveAnalyticsExercise(source.exerciseLabel)
    : sourceResolution;
  const exercise = set.exercise;
  if (exercise.kind === 'catalog') {
    return resolved.kind === 'catalog' && resolved.exerciseId === exercise.exerciseId;
  }
  const sourceIdentifiers = [source.exerciseIdentifier, source.exerciseLabel].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return resolved.kind === 'unresolved' && sourceIdentifiers.some(value => (
    normalizeExerciseIdentifier(value) === normalizeExerciseIdentifier(exercise.legacyIdentifier) ||
    normalizeExerciseIdentifier(value) === normalizeExerciseIdentifier(exercise.label)
  ));
}

function canonicalSetToLegacy(set: CanonicalHistorySet): WorkoutSetItem {
  const value: Record<string, unknown> = {
    id: set.id,
    exercise: canonicalExerciseIdentifier(set),
    weight: set.weightKg,
    reps: set.reps,
  };
  if (set.rir !== undefined) value.rir = set.rir;
  if (set.rpe !== undefined) value.rpe = set.rpe;
  if (set.notes !== undefined) value.notes = set.notes;
  if (set.completion === 'completed') value.completed = true;
  else if (set.completion === 'not_completed') value.completed = false;
  if (set.setType !== 'N') value.setType = set.setType;
  if (set.targetWeightKg !== undefined) value.targetWeight = set.targetWeightKg;
  if (set.targetReps !== undefined) value.targetReps = set.targetReps;
  return value as unknown as WorkoutSetItem;
}

function sourceSetToLegacy(set: CanonicalHistorySet, source: LegacySetSource | undefined): WorkoutSetItem {
  if (source?.representation === 'flat' && typeof source.raw === 'object' && source.raw !== null) {
    // Flat legacy callers historically received the original set object,
    // including optional fields and unknown presentation properties.
    return source.raw as WorkoutSetItem;
  }
  if (!source || typeof source.raw !== 'object' || source.raw === null) {
    return canonicalSetToLegacy(set);
  }

  // This mirrors the old nested projection exactly: nested output intentionally
  // omitted setType and target fields, while retaining undefined metadata keys.
  const raw = source.raw as Record<string, unknown>;
  return {
    id: raw.id as string,
    exercise: source.exerciseIdentifier,
    weight: raw.weight as number,
    reps: raw.reps as number,
    rir: raw.rir as number | undefined,
    rpe: raw.rpe as number | undefined,
    notes: raw.notes as string | undefined,
    completed: raw.completed as boolean | undefined,
  };
}

function projectHistory(
  history: readonly { workoutId: string; workoutTitle: string; date: string; timestamp: number; topWeight: number; topReps: number; topRIR?: number; topRPE?: number; maxE1RM: number; totalVolume: number; setsCount: number; sets: CanonicalHistorySet[] }[],
  sourcesBySessionId: Map<string, Map<string, LegacySetSource[]>>
): SessionExercisePerformance[] {
  return history.map(session => {
    const sourceMap = sourcesBySessionId.get(session.workoutId);
    const offsets = new Map<string, number>();
    const sets = session.sets.map(set => {
      const candidates = (sourceMap?.get(set.id) ?? []).filter(source => sourceMatchesExercise(source, set));
      const offsetKey = `${set.id}:${canonicalExerciseKey(set)}`;
      const offset = offsets.get(offsetKey) ?? 0;
      offsets.set(offsetKey, offset + 1);
      return sourceSetToLegacy(set, candidates[offset]);
    });
    return {
      workoutId: session.workoutId,
      workoutTitle: session.workoutTitle,
      date: session.date,
      timestamp: session.timestamp,
      topWeight: session.topWeight,
      topReps: session.topReps,
      topRIR: session.topRIR,
      topRPE: session.topRPE,
      maxE1RM: session.maxE1RM,
      totalVolume: session.totalVolume,
      setsCount: session.setsCount,
      sets,
    };
  });
}

/**
 * Backward-compatible entry point. Legacy records are normalized once and
 * then flow through the canonical history implementation.
 */
export function extractExerciseHistory(
  workouts: Workout[],
  targetExerciseIdentifier: string,
  options?: LegacyAnalyticsOptions
): SessionExercisePerformance[] {
  const result = extractExerciseHistoryWithDiagnostics(workouts, targetExerciseIdentifier, options);
  emitDiagnostics(result.diagnostics, options);
  return result.data;
}

/** Opt-in diagnostic form for callers that want read-normalization details. */
export function extractExerciseHistoryWithDiagnostics(
  workouts: Workout[],
  targetExerciseIdentifier: string,
  options?: LegacyAnalyticsOptions
): AnalyticsResult<SessionExercisePerformance[]> {
  const adapted = adaptLegacyWorkoutsForAnalytics(workouts, options);
  const canonical = extractExerciseHistoryFromCanonicalResult(adapted.sessions, targetExerciseIdentifier);
  return {
    data: projectHistory(canonical.data, adapted.sourcesBySessionId),
    diagnostics: [...adapted.diagnostics, ...canonical.diagnostics],
  };
}

/**
 * Backward-compatible progression entry point. The canonical report is
 * formatted into the existing public DTO without changing its fields.
 */
export function analyzeExerciseProgression(
  workouts: Workout[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string,
  options?: LegacyAnalyticsOptions
): ProgressionReport {
  const result = analyzeExerciseProgressionWithDiagnostics(workouts, exerciseIdentifier, exerciseDisplayName, options);
  emitDiagnostics(result.diagnostics, options);
  return result.data;
}

/** Opt-in diagnostic form retaining the legacy report DTO. */
export function analyzeExerciseProgressionWithDiagnostics(
  workouts: Workout[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string,
  options?: LegacyAnalyticsOptions
): AnalyticsResult<ProgressionReport> {
  const adapted = adaptLegacyWorkoutsForAnalytics(workouts, options);
  const canonicalHistory = extractExerciseHistoryFromCanonicalResult(adapted.sessions, exerciseIdentifier);
  const canonicalReport = analyzeExerciseProgressionFromCanonicalResult(canonicalHistory.data, exerciseIdentifier, exerciseDisplayName);
  return {
    data: {
      ...canonicalReport.data,
      history: canonicalReport.data.history,
    },
    diagnostics: mergeDiagnostics(adapted.diagnostics, canonicalHistory.diagnostics, canonicalReport.diagnostics),
  };
}
