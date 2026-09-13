import { Workout } from '../types';
import { calculateE1RM, extractExerciseHistory, analyzeExerciseProgression, SessionExercisePerformance } from '../lib/progression';
import { calculatePhysiqueHypertrophyVolume, HypertrophyThresholds, DEFAULT_HYPERTROPHY_THRESHOLDS } from '../lib/hypertrophy';
import { getExerciseById, MuscleGroup } from '../lib/exercises';

export { calculateE1RM, extractExerciseHistory, analyzeExerciseProgression };
export type { SessionExercisePerformance };

// Canonical Phase 2 analytics APIs. The legacy exports above remain the
// compatibility boundary used by existing callers.
export {
  extractExerciseHistoryFromCanonical,
  extractExerciseHistoryFromCanonicalResult,
  analyzeExerciseProgressionFromCanonical,
  analyzeExerciseProgressionFromCanonicalResult,
  analyzeExerciseProgressionFromCanonicalSessions,
  analyzeExerciseProgressionFromCanonicalSessionsResult,
} from './analytics/index';
export { extractExerciseHistoryWithDiagnostics, analyzeExerciseProgressionWithDiagnostics } from '../lib/progression';
export type {
  AnalyticsDiagnostic,
  AnalyticsResult,
  CanonicalExerciseHistorySession,
  CanonicalProgressionReport,
} from './analytics/index';

export interface StallDetectionResult {
  exerciseId: string;
  isStalled: boolean;
  sessionsAnalyzed: number;
  consecutiveStallCount: number;
  percentageDelta: number;
  e1rmHistory: number[];
  loadsHistory: number[];
  targetRirAvg?: number;
  recommendedAction: 'HOLD_LOAD' | 'DELOAD' | 'CHANGE_EXERCISE' | 'ADJUST_VOLUME' | 'ASSESS_FATIGUE' | 'NONE';
  rationale: string;
}

/**
 * Deterministic Stall Detection:
 * Triggered when a movement shows < 2.5% progression in e1RM or load across 3-4 consecutive sessions at target RIR.
 */
export function detectExerciseStall(
  workouts: Workout[],
  exerciseIdentifier: string
): StallDetectionResult {
  const history = extractExerciseHistory(workouts, exerciseIdentifier);
  const def = getExerciseById(exerciseIdentifier);
  const name = def?.name || exerciseIdentifier;

  if (history.length < 3) {
    return {
      exerciseId: exerciseIdentifier,
      isStalled: false,
      sessionsAnalyzed: history.length,
      consecutiveStallCount: 0,
      percentageDelta: 0,
      e1rmHistory: history.map(h => h.maxE1RM),
      loadsHistory: history.map(h => h.topWeight),
      recommendedAction: 'NONE',
      rationale: history.length === 0
        ? `No logged history found for ${name}.`
        : `Only ${history.length} session(s) recorded for ${name}. Minimum 3 consecutive sessions required to evaluate stall criteria.`
    };
  }

  // Look at the last 3-4 consecutive sessions
  const windowSize = Math.min(4, history.length);
  const recentWindow = history.slice(history.length - windowSize);
  const e1rmHistory = recentWindow.map(h => h.maxE1RM);
  const loadsHistory = recentWindow.map(h => h.topWeight);

  const firstE1RM = e1rmHistory[0];
  const lastE1RM = e1rmHistory[e1rmHistory.length - 1];

  const pctDelta = firstE1RM > 0
    ? Math.round(((lastE1RM - firstE1RM) / firstE1RM) * 1000) / 10
    : 0;

  // Average RIR across recent window
  let totalRir = 0;
  let rirCount = 0;
  for (const s of recentWindow) {
    if (s.topRIR !== undefined && s.topRIR !== null) {
      totalRir += s.topRIR;
      rirCount++;
    }
  }
  const avgRir = rirCount > 0 ? Math.round((totalRir / rirCount) * 10) / 10 : undefined;

  // Check if each consecutive step in the window showed < 2.5% improvement
  let consecutiveStalls = 0;
  for (let i = 1; i < recentWindow.length; i++) {
    const prev = recentWindow[i - 1].maxE1RM;
    const curr = recentWindow[i].maxE1RM;
    const stepDeltaPct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    if (stepDeltaPct < 2.5) {
      consecutiveStalls++;
    }
  }

  const isStalled = consecutiveStalls >= 2 && pctDelta < 2.5;

  let recommendedAction: StallDetectionResult['recommendedAction'] = 'NONE';
  let rationale = '';

  if (isStalled) {
    if (avgRir !== undefined && avgRir <= 1) {
      // User is pushing close to failure (RIR 0-1) across 3-4 sessions with no progression -> Systemic fatigue
      recommendedAction = 'DELOAD';
      rationale = `${name} has stalled across ${windowSize} consecutive sessions (e1RM delta: ${pctDelta}%). High perceived exertion (avg RIR ${avgRir}) suggests accumulated fatigue. A 1-week deload (-10% load) or volume reduction is advised.`;
    } else if (consecutiveStalls >= 3) {
      // Prolonged stall across 4 sessions
      recommendedAction = 'CHANGE_EXERCISE';
      rationale = `${name} has plateaued across 4 consecutive sessions without progressive overload (< 2.5% progression). Consider rotating to an adjacent exercise variation (e.g., Incline Dumbbell Press or Pause Reps) or adjusting volume.`;
    } else {
      // 3 sessions stalled at moderate RIR
      recommendedAction = 'HOLD_LOAD';
      rationale = `${name} shows < 2.5% e1RM progression (${pctDelta}%) across ${windowSize} consecutive sessions. Hold current working weight (${loadsHistory[loadsHistory.length - 1]}kg) and target +1 rep or set quality improvement before advancing load.`;
    }
  } else {
    rationale = `${name} is currently progressing or maintaining normal adaptation trajectory (${pctDelta}% e1RM change over last ${windowSize} sessions).`;
  }

  return {
    exerciseId: exerciseIdentifier,
    isStalled,
    sessionsAnalyzed: windowSize,
    consecutiveStallCount: consecutiveStalls,
    percentageDelta: pctDelta,
    e1rmHistory,
    loadsHistory,
    targetRirAvg: avgRir,
    recommendedAction,
    rationale
  };
}

export interface MuscleGroupVolumeSummary {
  muscle: MuscleGroup;
  weeklySets: number;
  targetThreshold: number;
  isDeficit: boolean;
  status: 'OPTIMAL' | 'DEFICIT' | 'ABOVE_TARGET';
}

/**
 * Calculates weekly completed sets per muscle group and flags volume deficits.
 */
export function calculateMuscleGroupVolume(
  workouts: Workout[],
  customThresholds?: Partial<HypertrophyThresholds>
): Record<MuscleGroup, MuscleGroupVolumeSummary> {
  const audit = calculatePhysiqueHypertrophyVolume(workouts, customThresholds);
  const result = {} as Record<MuscleGroup, MuscleGroupVolumeSummary>;

  for (const [mKey, data] of Object.entries(audit.muscles)) {
    const muscle = mKey as MuscleGroup;
    const weeklySets = data.week1Sets;
    const targetThreshold = data.targetThreshold || DEFAULT_HYPERTROPHY_THRESHOLDS[muscle] || 10;
    const isDeficit = weeklySets < targetThreshold;

    result[muscle] = {
      muscle,
      weeklySets,
      targetThreshold,
      isDeficit,
      status: isDeficit ? 'DEFICIT' : weeklySets > targetThreshold * 1.5 ? 'ABOVE_TARGET' : 'OPTIMAL'
    };
  }

  return result;
}
