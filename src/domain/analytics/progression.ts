import { getExerciseById } from '../../lib/exercises';
import type { TrainingSession } from '../canonical';
import { resolveAnalyticsExercise } from './identity';
import { extractExerciseHistoryFromCanonicalResult } from './history';
import type {
  AnalyticsDiagnostic,
  AnalyticsResult,
  CanonicalExerciseHistorySession,
  CanonicalNextSessionTarget,
  CanonicalProgressionReport,
  CanonicalProgressionState,
} from './contracts';

function identityDiagnostic(resolution: ReturnType<typeof resolveAnalyticsExercise>, identifier: string): AnalyticsDiagnostic | undefined {
  if (resolution.kind === 'ambiguous') {
    return {
      severity: 'failure',
      code: 'ambiguous_exercise_identity',
      message: `Exercise identifier "${identifier}" matches multiple canonical exercises: ${resolution.candidates.join(', ')}.`,
      exerciseIdentifier: identifier,
    };
  }
  if (resolution.kind === 'unresolved' && !resolution.normalized) {
    return {
      severity: 'warning',
      code: 'empty_exercise_identity',
      message: 'An empty exercise identifier cannot select a canonical exercise.',
      exerciseIdentifier: identifier,
    };
  }
  if (resolution.kind === 'unresolved') {
    return {
      severity: 'warning',
      code: 'unknown_exercise_identity',
      message: `Exercise identifier "${identifier}" has no catalog identity; it remains an exact-match custom reference.`,
      exerciseIdentifier: identifier,
    };
  }
  return undefined;
}

function dedupeDiagnostics(...groups: readonly AnalyticsDiagnostic[][]): AnalyticsDiagnostic[] {
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

/**
 * Applies the existing deterministic progression policy to canonical history.
 * Thresholds, e1RM formulas, rationale text and target selection are kept
 * verbatim so this module is an architecture move rather than a policy change.
 */
export function analyzeExerciseProgressionFromCanonicalResult(
  history: readonly CanonicalExerciseHistorySession[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string
): AnalyticsResult<CanonicalProgressionReport> {
  const diagnostics: AnalyticsDiagnostic[] = [];
  const legacyDisplayDef = getExerciseById(exerciseIdentifier);
  const resolved = resolveAnalyticsExercise(exerciseIdentifier);
  const identityIssue = identityDiagnostic(resolved, exerciseIdentifier);
  if (identityIssue) diagnostics.push(identityIssue);
  const canonicalDef = resolved.kind === 'catalog' ? getExerciseById(resolved.exerciseId) : legacyDisplayDef;
  const name = exerciseDisplayName || legacyDisplayDef?.name || exerciseIdentifier;

  const isCompound = canonicalDef?.movementPattern === 'PUSH' || canonicalDef?.movementPattern === 'PULL' ||
                     canonicalDef?.movementPattern === 'SQUAT' || canonicalDef?.movementPattern === 'HINGE' ||
                     name.toLowerCase().includes('press') || name.toLowerCase().includes('squat') ||
                     name.toLowerCase().includes('deadlift') || name.toLowerCase().includes('row');
  const weightIncrement = isCompound ? 2.5 : 1.25;

  const mappedHistory = [...history].reverse().map(session => ({
    date: session.date,
    totalVolume: session.totalVolume,
    sets: session.sets.map(setItem => ({
      weight: setItem.weightKg,
      reps: setItem.reps,
      rir: setItem.rir,
    })),
  }));

  if (history.length < 2) {
    const singleSession = history.length === 1 ? history[0] : undefined;
    const defaultWeight = singleSession ? singleSession.topWeight : (isCompound ? 60 : 15);
    const defaultReps = singleSession ? singleSession.topReps : 8;

    const baseTarget: CanonicalNextSessionTarget = {
      targetWeight: defaultWeight,
      targetRepsMin: Math.max(6, defaultReps - 1),
      targetRepsMax: Math.max(8, defaultReps + 2),
      targetSets: 3,
      suggestedRIR: 2,
      action: 'BASELINE',
      rationale: history.length === 0
        ? `No prior logs found. Establish a baseline with ${defaultWeight}kg targeting 6–8 reps at RIR 2.`
        : `1 session recorded (${singleSession?.topWeight}kg × ${singleSession?.topReps}). Log at least 1 more session to establish a deterministic progression trend.`,
    };

    return {
      data: {
        exerciseId: exerciseIdentifier,
        exerciseName: name,
        state: 'INSUFFICIENT_DATA',
        currentE1RM: singleSession ? singleSession.maxE1RM : 0,
        previousE1RM: 0,
        deltaE1RM: 0,
        percentageDelta: 0,
        recentSessionsCount: history.length,
        lastPerformance: singleSession ? {
          date: singleSession.date,
          weight: singleSession.topWeight,
          reps: singleSession.topReps,
          rir: singleSession.topRIR,
          rpe: singleSession.topRPE,
          e1RM: singleSession.maxE1RM,
          volume: singleSession.totalVolume,
        } : undefined,
        history: mappedHistory,
        summary: history.length === 0
          ? 'Insufficient data: No logged sessions recorded for this movement yet.'
          : 'Insufficient data: Only 1 session recorded. Complete one more session to unlock progression tracking.',
        rationales: [
          'Need at least 2 distinct completed workouts to calculate a deterministic performance trajectory.',
        ],
        nextTarget: baseTarget,
      },
      diagnostics,
    };
  }

  const latestSession = history[history.length - 1]!;
  const previousSession = history[history.length - 2]!;
  const currentE1RM = latestSession.maxE1RM;
  const previousE1RM = previousSession.maxE1RM;
  const deltaE1RM = Math.round((currentE1RM - previousE1RM) * 10) / 10;
  const percentageDelta = previousE1RM > 0 ? Math.round(((currentE1RM - previousE1RM) / previousE1RM) * 1000) / 10 : 0;

  // Kept for parity with the original policy; the current classifier does not
  // consume this value yet.
  let threeSessionTrend = 0;
  if (history.length >= 3) {
    const twoPriorSession = history[history.length - 3]!;
    threeSessionTrend = currentE1RM - twoPriorSession.maxE1RM;
  }
  void threeSessionTrend;

  let state: CanonicalProgressionState = 'STALLING';
  const rationales: string[] = [];
  let summary = '';
  let nextTarget: CanonicalNextSessionTarget;

  const isWeightUp = latestSession.topWeight > previousSession.topWeight && latestSession.topReps >= previousSession.topReps;
  const isRepsUpSameWeight = latestSession.topWeight === previousSession.topWeight && latestSession.topReps > previousSession.topReps;
  const isRIRUpSamePerformance = latestSession.topWeight === previousSession.topWeight &&
                                latestSession.topReps === previousSession.topReps &&
                                (latestSession.topRIR || 0) > (previousSession.topRIR || 0);

  if (percentageDelta >= 1.5 || isWeightUp || isRepsUpSameWeight || isRIRUpSamePerformance || deltaE1RM >= 1.5) {
    state = 'PROGRESSING';
    rationales.push(`Estimated 1RM increased by +${deltaE1RM > 0 ? deltaE1RM : 1.5}kg (+${percentageDelta > 0 ? percentageDelta : 2}%) compared to previous session.`);
    if (isWeightUp) {
      rationales.push(`Successfully lifted heavier load (${latestSession.topWeight}kg vs ${previousSession.topWeight}kg) while maintaining repetition volume.`);
    } else if (isRepsUpSameWeight) {
      rationales.push(`Increased repetitions (+${latestSession.topReps - previousSession.topReps} rep${latestSession.topReps - previousSession.topReps > 1 ? 's' : ''}) at ${latestSession.topWeight}kg.`);
    }

    if (latestSession.topRIR !== undefined && latestSession.topRIR >= 2) {
      rationales.push(`Completed with solid reserve (RIR ${latestSession.topRIR}), indicating capacity for progressive overload.`);
    }

    summary = `Progressing: Estimated 1RM has increased across recent sessions (+${deltaE1RM}kg / +${percentageDelta}%).`;

    const repThreshold = isCompound ? 8 : 12;
    if (latestSession.topReps >= repThreshold || (latestSession.topRIR && latestSession.topRIR >= 2)) {
      const nextWeight = latestSession.topWeight + weightIncrement;
      nextTarget = {
        targetWeight: nextWeight,
        targetRepsMin: Math.max(6, latestSession.topReps - 2),
        targetRepsMax: latestSession.topReps,
        targetSets: latestSession.setsCount || 3,
        suggestedRIR: 2,
        action: 'INCREASE_WEIGHT',
        rationale: `Strong progressive overload: Increase weight to ${nextWeight}kg (+${weightIncrement}kg) targeting ${Math.max(6, latestSession.topReps - 2)}–${latestSession.topReps} reps.`,
      };
    } else {
      nextTarget = {
        targetWeight: latestSession.topWeight,
        targetRepsMin: latestSession.topReps,
        targetRepsMax: latestSession.topReps + 2,
        targetSets: latestSession.setsCount || 3,
        suggestedRIR: 1,
        action: 'INCREASE_REPS',
        rationale: `Maintain ${latestSession.topWeight}kg and aim to push reps from ${latestSession.topReps} to ${latestSession.topReps + 1}–${latestSession.topReps + 2}.`,
      };
    }
  } else if (percentageDelta <= -3.0 && (latestSession.topWeight < previousSession.topWeight || latestSession.topReps < previousSession.topReps)) {
    state = 'REGRESSING';
    rationales.push(`Estimated 1RM dropped by ${Math.abs(deltaE1RM)}kg (${percentageDelta}%) compared to prior session.`);
    rationales.push(`Performance decline observed (${latestSession.topWeight}kg × ${latestSession.topReps} vs prior ${previousSession.topWeight}kg × ${previousSession.topReps}).`);
    if (latestSession.topRIR === 0 || (latestSession.topRPE && latestSession.topRPE >= 9.5)) {
      rationales.push('High perceived exertion / zero reserve suggests systemic or localized fatigue accumulation.');
    }

    summary = `Regressing: Performance has declined across recent sessions (-${Math.abs(deltaE1RM)}kg e1RM). Consider fatigue management.`;
    const deloadWeight = Math.max(isCompound ? 20 : 5, Math.round((latestSession.topWeight * 0.925) / 2.5) * 2.5);
    nextTarget = {
      targetWeight: deloadWeight,
      targetRepsMin: Math.max(6, latestSession.topReps),
      targetRepsMax: Math.max(8, latestSession.topReps + 2),
      targetSets: Math.max(2, (latestSession.setsCount || 3) - 1),
      suggestedRIR: 3,
      action: 'DELOAD',
      rationale: `Fatigue mitigation: Modulate load to ${deloadWeight}kg at RIR 3 to restore recovery and rebuild volume safely.`,
    };
  } else {
    state = 'STALLING';
    rationales.push(`Performance has remained approximately unchanged across the last ${history.length} logged sessions.`);
    rationales.push(`Latest: ${latestSession.topWeight}kg × ${latestSession.topReps} (e1RM ${currentE1RM}kg) vs Prior: ${previousSession.topWeight}kg × ${previousSession.topReps} (e1RM ${previousE1RM}kg).`);

    summary = `Stalling: Performance has remained approximately unchanged across recent sessions (e1RM delta ${deltaE1RM >= 0 ? '+' : ''}${deltaE1RM}kg).`;
    nextTarget = {
      targetWeight: latestSession.topWeight,
      targetRepsMin: latestSession.topReps,
      targetRepsMax: latestSession.topReps + 1,
      targetSets: latestSession.setsCount || 3,
      suggestedRIR: 2,
      action: 'MAINTAIN',
      rationale: `Plateau detected: Hold weight at ${latestSession.topWeight}kg. Focus on breaking the stall with +1 clean repetition before increasing weight.`,
    };
  }

  return {
    data: {
      exerciseId: exerciseIdentifier,
      exerciseName: name,
      state,
      currentE1RM,
      previousE1RM,
      deltaE1RM,
      percentageDelta,
      recentSessionsCount: history.length,
      lastPerformance: {
        date: latestSession.date,
        weight: latestSession.topWeight,
        reps: latestSession.topReps,
        rir: latestSession.topRIR,
        rpe: latestSession.topRPE,
        e1RM: latestSession.maxE1RM,
        volume: latestSession.totalVolume,
      },
      summary,
      rationales,
      nextTarget,
      history: mappedHistory,
    },
    diagnostics,
  };
}

export function analyzeExerciseProgressionFromCanonical(
  history: readonly CanonicalExerciseHistorySession[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string,
  onDiagnostic?: (diagnostic: import('./contracts').AnalyticsDiagnostic) => void
): CanonicalProgressionReport {
  const result = analyzeExerciseProgressionFromCanonicalResult(history, exerciseIdentifier, exerciseDisplayName);
  result.diagnostics.forEach(item => onDiagnostic?.(item));
  return result.data;
}

/** Convenience entry point for callers that have sessions but no history yet. */
export function analyzeExerciseProgressionFromCanonicalSessionsResult(
  sessions: readonly TrainingSession[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string
): AnalyticsResult<CanonicalProgressionReport> {
  // Keep extraction and policy separate while offering a single canonical
  // sessions entry point for application callers.
  const extracted = extractExerciseHistoryFromCanonicalResult(sessions, exerciseIdentifier);
  const report = analyzeExerciseProgressionFromCanonicalResult(extracted.data, exerciseIdentifier, exerciseDisplayName);
  return { data: report.data, diagnostics: dedupeDiagnostics(extracted.diagnostics, report.diagnostics) };
}

export function analyzeExerciseProgressionFromCanonicalSessions(
  sessions: readonly TrainingSession[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string,
  onDiagnostic?: (diagnostic: import('./contracts').AnalyticsDiagnostic) => void
): CanonicalProgressionReport {
  const result = analyzeExerciseProgressionFromCanonicalSessionsResult(sessions, exerciseIdentifier, exerciseDisplayName);
  result.diagnostics.forEach(item => onDiagnostic?.(item));
  return result.data;
}
