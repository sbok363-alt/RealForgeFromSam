import type { TrainingSession } from '../canonical';
import { calculateE1RM } from './math';
import {
  matchesCanonicalExerciseReference,
  resolveAnalyticsExercise,
  resolveCanonicalReference,
  type ExerciseIdentityResolution,
} from './identity';
import type {
  AnalyticsDiagnostic,
  AnalyticsResult,
  CanonicalExerciseHistorySession,
  CanonicalHistorySet,
} from './contracts';

function diagnostic(
  diagnostics: AnalyticsDiagnostic[],
  value: Omit<AnalyticsDiagnostic, 'severity'> & { severity?: AnalyticsDiagnostic['severity'] }
): void {
  diagnostics.push({ severity: 'warning', ...value });
}

function sessionTiming(session: TrainingSession, diagnostics: AnalyticsDiagnostic[]) {
  const date = session.scheduledDate ?? (session.completedAt ? (new Date(session.completedAt).toISOString().split('T')[0] ?? '') : '');
  const timestamp = session.completedAt
    ? Date.parse(session.completedAt)
    : session.scheduledDate
      ? Date.parse(`${session.scheduledDate}T00:00:00.000Z`)
      : 0;
  if (!Number.isFinite(timestamp)) {
    diagnostic(diagnostics, {
      code: 'invalid_session_time',
      message: 'Session time was invalid; it was ordered at timestamp zero.',
      sessionId: session.id,
    });
    return { date, timestamp: 0 };
  }
  return { date, timestamp };
}

function reportIdentityDiagnostic(
  diagnostics: AnalyticsDiagnostic[],
  resolution: ExerciseIdentityResolution,
  identifier: string
): void {
  if (resolution.kind === 'ambiguous') {
    diagnostic(diagnostics, {
      severity: 'failure',
      code: 'ambiguous_exercise_identity',
      message: `Exercise identifier "${identifier}" matches multiple canonical exercises: ${resolution.candidates.join(', ')}.`,
      exerciseIdentifier: identifier,
    });
  } else if (resolution.kind === 'unresolved' && !resolution.normalized) {
    diagnostic(diagnostics, {
      code: 'empty_exercise_identity',
      message: 'An empty exercise identifier cannot select a canonical exercise.',
      exerciseIdentifier: identifier,
    });
  } else if (resolution.kind === 'unresolved') {
    diagnostic(diagnostics, {
      code: 'unknown_exercise_identity',
      message: `Exercise identifier "${identifier}" has no catalog identity; it remains an exact-match custom reference.`,
      exerciseIdentifier: identifier,
    });
  }
}

/**
 * Extract exercise history from canonical TrainingSession records. This is
 * the sole history computation path; legacy records are adapted before it is
 * called by the compatibility wrapper.
 */
export function extractExerciseHistoryFromCanonicalResult(
  sessions: readonly TrainingSession[],
  targetExerciseIdentifier: string
): AnalyticsResult<CanonicalExerciseHistorySession[]> {
  const diagnostics: AnalyticsDiagnostic[] = [];
  const target = resolveAnalyticsExercise(targetExerciseIdentifier);
  reportIdentityDiagnostic(diagnostics, target, targetExerciseIdentifier);
  if (target.kind === 'ambiguous' || (target.kind === 'unresolved' && !target.normalized)) {
    return { data: [], diagnostics };
  }

  const entries: { index: number; value: CanonicalExerciseHistorySession }[] = [];
  const reportedSourceDiagnostics = new Set<string>();

  for (const session of sessions) {
    if (session.status !== 'COMPLETED') continue;

    const matchingSets: CanonicalHistorySet[] = [];
    for (const exercise of session.exercises) {
      const sourceResolution = resolveCanonicalReference(exercise.exercise);
      if (sourceResolution.kind === 'ambiguous') {
        const key = `${session.id}:${exercise.exercise.kind}:${exercise.exercise.kind === 'catalog' ? exercise.exercise.exerciseId : exercise.exercise.legacyIdentifier}`;
        if (!reportedSourceDiagnostics.has(key)) {
          reportedSourceDiagnostics.add(key);
          reportIdentityDiagnostic(diagnostics, sourceResolution, exercise.exercise.kind === 'catalog' ? exercise.exercise.exerciseId : exercise.exercise.legacyIdentifier);
        }
      } else if (sourceResolution.kind === 'unresolved') {
        const key = `${session.id}:${exercise.exercise.kind}:${exercise.exercise.kind === 'catalog' ? exercise.exercise.exerciseId : exercise.exercise.legacyIdentifier}:unresolved`;
        if (!reportedSourceDiagnostics.has(key)) {
          reportedSourceDiagnostics.add(key);
          reportIdentityDiagnostic(diagnostics, sourceResolution, exercise.exercise.kind === 'unresolved' ? exercise.exercise.legacyIdentifier : exercise.exercise.label);
        }
      }
      if (!matchesCanonicalExerciseReference(exercise.exercise, target)) continue;
      for (const performance of exercise.sets) {
        // Unknown completion is retained for historical compatibility. An
        // explicit not_completed set is intentionally excluded.
        if (performance.completion === 'not_completed') continue;
        matchingSets.push({ ...performance, exercise: exercise.exercise });
      }
    }

    if (matchingSets.length === 0) continue;

    let topWeight = 0;
    let topReps = 0;
    let topRIR: number | undefined;
    let topRPE: number | undefined;
    let maxE1RM = 0;
    let totalVolume = 0;

    for (const performance of matchingSets) {
      const weight = performance.weightKg;
      const reps = performance.reps;
      // Canonical schemas guarantee finite ranges. Zero-load/zero-rep sets
      // remain countable but have no useful volume or e1RM, matching the old
      // deterministic policy.
      if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) continue;
      totalVolume += weight * reps;
      const e1rm = calculateE1RM(weight, reps, performance.rir);
      if (e1rm > maxE1RM) {
        maxE1RM = e1rm;
        topWeight = weight;
        topReps = reps;
        topRIR = performance.rir;
        topRPE = performance.rpe;
      }
    }

    if (maxE1RM <= 0) continue;
    const timing = sessionTiming(session, diagnostics);
    entries.push({
      index: entries.length,
      value: {
        workoutId: session.id,
        workoutTitle: session.title,
        date: timing.date,
        timestamp: timing.timestamp,
        topWeight,
        topReps,
        topRIR,
        topRPE,
        maxE1RM,
        totalVolume,
        setsCount: matchingSets.length,
        sets: matchingSets,
      },
    });
  }

  entries.sort((left, right) => left.value.timestamp - right.value.timestamp || left.index - right.index);
  return { data: entries.map(entry => entry.value), diagnostics };
}

export function extractExerciseHistoryFromCanonical(
  sessions: readonly TrainingSession[],
  targetExerciseIdentifier: string,
  onDiagnostic?: (diagnostic: AnalyticsDiagnostic) => void
): CanonicalExerciseHistorySession[] {
  const result = extractExerciseHistoryFromCanonicalResult(sessions, targetExerciseIdentifier);
  result.diagnostics.forEach(item => onDiagnostic?.(item));
  return result.data;
}
