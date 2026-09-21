import { Workout, WorkoutSetItem, ProgressionReport, ProgressionState, NextSessionTarget } from '../types';
import { getExerciseById } from './exercises';
import { projectCompletedWorkingSets } from './workout-session';

/**
 * Calculates Estimated 1RM using the validated Epley formula.
 * e1RM = weight * (1 + reps / 30)
 */
export function calculateE1RM(weight: number, reps: number, rir?: number | null): number {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return 0;
  if (typeof reps !== 'number' || !Number.isFinite(reps) || reps <= 0) return 0;

  let validRir = 0;
  if (typeof rir === 'number' && Number.isFinite(rir)) {
    validRir = Math.max(0, Math.min(rir, 5));
  }

  if (reps === 1 && validRir === 0) return weight;
  // If RIR is known, we can calculate effective capacity
  const effectiveReps = reps + validRir;
  const val = Math.round((weight * (1 + effectiveReps / 30)) * 10) / 10;
  return Number.isFinite(val) ? val : 0;
}

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

/**
 * Extracts chronological exercise performances from a list of user workouts.
 */
export function extractExerciseHistory(
  workouts: Workout[],
  targetExerciseIdentifier: string
): SessionExercisePerformance[] {
  const normalizedTarget = targetExerciseIdentifier.toLowerCase().replace(/[-_\s]+/g, '');
  const sessions: SessionExercisePerformance[] = [];

  for (const w of workouts) {
    if (w.status !== 'COMPLETED' && w.status !== 'completed') {
      continue;
    }

    const dateStr = w.scheduledDate || (w.completedAt ? new Date(w.completedAt).toISOString().split('T')[0] : '');
    const timestamp = w.completedAt || (w.scheduledDate ? new Date(w.scheduledDate).getTime() : 0);

    const matchingSets: WorkoutSetItem[] = projectCompletedWorkingSets(w).filter((set) => {
      const normEx = (set.exercise || '').toLowerCase().replace(/[-_\s]+/g, '');
      return normEx === normalizedTarget || normEx.includes(normalizedTarget) || normalizedTarget.includes(normEx);
    });

    if (matchingSets.length > 0) {
      let topWeight = 0;
      let topReps = 0;
      let topRIR: number | undefined = undefined;
      let topRPE: number | undefined = undefined;
      let maxE1RM = 0;
      let totalVolume = 0;

      for (const s of matchingSets) {
        const weight = Number(s.weight);
        const reps = Number(s.reps);
        if (isNaN(weight) || isNaN(reps) || weight <= 0 || reps <= 0 || !isFinite(weight) || !isFinite(reps)) continue;
        const vol = weight * reps;
        totalVolume += vol;
        const e1rm = calculateE1RM(weight, reps, s.rir);
        if (e1rm > maxE1RM) {
          maxE1RM = e1rm;
          topWeight = weight;
          topReps = reps;
          topRIR = s.rir;
          topRPE = s.rpe;
        }
      }

      if (maxE1RM > 0) {
        sessions.push({
          workoutId: w.id,
          workoutTitle: w.title || w.name || 'Workout',
          date: dateStr,
          timestamp,
          topWeight,
          topReps,
          topRIR,
          topRPE,
          maxE1RM,
          totalVolume,
          setsCount: matchingSets.length,
          sets: matchingSets
        });
      }
    }
  }

  // Sort chronological: oldest to newest
  return sessions.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Deterministic progression classifier and target calculator.
 * Pure function: takes workout history and exercise identifier, returns ProgressionReport.
 */
export function analyzeExerciseProgression(
  workouts: Workout[],
  exerciseIdentifier: string,
  exerciseDisplayName?: string
): ProgressionReport {
  const history = extractExerciseHistory(workouts, exerciseIdentifier);
  const def = getExerciseById(exerciseIdentifier);
  const name = exerciseDisplayName || def?.name || exerciseIdentifier;

  // Determine appropriate weight step: compound (2.5kg) vs accessory (1.0-1.25kg)
  const isCompound = def?.movementPattern === 'PUSH' || def?.movementPattern === 'PULL' || 
                     def?.movementPattern === 'SQUAT' || def?.movementPattern === 'HINGE' ||
                     name.toLowerCase().includes('press') || name.toLowerCase().includes('squat') ||
                     name.toLowerCase().includes('deadlift') || name.toLowerCase().includes('row');
  const weightIncrement = isCompound ? 2.5 : 1.25;

  // Format chronological history reversed (most recent session at index 0)
  const mappedHistory = [...history].reverse().map(s => ({
    date: s.date,
    totalVolume: s.totalVolume,
    sets: s.sets.map(setItem => ({
      weight: setItem.weight,
      reps: setItem.reps,
      rir: setItem.rir
    }))
  }));

  // Case 1: Insufficient Historical Data (< 2 sessions)
  if (history.length < 2) {
    const singleSession = history.length === 1 ? history[0] : undefined;
    const defaultWeight = singleSession ? singleSession.topWeight : (isCompound ? 60 : 15);
    const defaultReps = singleSession ? singleSession.topReps : 8;

    const baseTarget: NextSessionTarget = {
      targetWeight: defaultWeight,
      targetRepsMin: Math.max(6, defaultReps - 1),
      targetRepsMax: Math.max(8, defaultReps + 2),
      targetSets: 3,
      suggestedRIR: 2,
      action: 'BASELINE',
      rationale: history.length === 0
        ? `No prior logs found. Establish a baseline with ${defaultWeight}kg targeting 6–8 reps at RIR 2.`
        : `1 session recorded (${singleSession?.topWeight}kg × ${singleSession?.topReps}). Log at least 1 more session to establish a deterministic progression trend.`
    };

    return {
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
        volume: singleSession.totalVolume
      } : undefined,
      history: mappedHistory,
      summary: history.length === 0 
        ? 'Insufficient data: No logged sessions recorded for this movement yet.' 
        : 'Insufficient data: Only 1 session recorded. Complete one more session to unlock progression tracking.',
      rationales: [
        'Need at least 2 distinct completed workouts to calculate a deterministic performance trajectory.'
      ],
      nextTarget: baseTarget
    };
  }

  // We have >= 2 sessions
  const latestSession = history[history.length - 1];
  const previousSession = history[history.length - 2];
  
  const currentE1RM = latestSession.maxE1RM;
  const previousE1RM = previousSession.maxE1RM;
  const deltaE1RM = Math.round((currentE1RM - previousE1RM) * 10) / 10;
  const percentageDelta = previousE1RM > 0 ? Math.round(((currentE1RM - previousE1RM) / previousE1RM) * 1000) / 10 : 0;

  // Evaluate multi-session trend if >= 3 sessions available
  let threeSessionTrend = 0;
  if (history.length >= 3) {
    const twoPriorSession = history[history.length - 3];
    threeSessionTrend = currentE1RM - twoPriorSession.maxE1RM;
  }

  let state: ProgressionState = 'STALLING';
  const rationales: string[] = [];
  let summary = '';
  let nextTarget: NextSessionTarget;

  // 1. PROGRESSING CRITERIA:
  // - e1RM delta > +1.5%, OR
  // - weight increased at same/more reps, OR
  // - reps increased with same weight, OR
  // - RIR increased with same weight & reps
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

    // Next Target for PROGRESSING:
    // If top reps reached upper threshold (e.g. >= 8 for compounds or >= 12 for accessories) OR high RIR >= 2, increase weight
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
        rationale: `Strong progressive overload: Increase weight to ${nextWeight}kg (+${weightIncrement}kg) targeting ${Math.max(6, latestSession.topReps - 2)}–${latestSession.topReps} reps.`
      };
    } else {
      nextTarget = {
        targetWeight: latestSession.topWeight,
        targetRepsMin: latestSession.topReps,
        targetRepsMax: latestSession.topReps + 2,
        targetSets: latestSession.setsCount || 3,
        suggestedRIR: 1,
        action: 'INCREASE_REPS',
        rationale: `Maintain ${latestSession.topWeight}kg and aim to push reps from ${latestSession.topReps} to ${latestSession.topReps + 1}–${latestSession.topReps + 2}.`
      };
    }
  } 
  // 2. REGRESSING CRITERIA:
  // - e1RM delta <= -3% AND topWeight or topReps dropped
  else if (percentageDelta <= -3.0 && (latestSession.topWeight < previousSession.topWeight || latestSession.topReps < previousSession.topReps)) {
    state = 'REGRESSING';
    rationales.push(`Estimated 1RM dropped by ${Math.abs(deltaE1RM)}kg (${percentageDelta}%) compared to prior session.`);
    rationales.push(`Performance decline observed (${latestSession.topWeight}kg × ${latestSession.topReps} vs prior ${previousSession.topWeight}kg × ${previousSession.topReps}).`);
    if (latestSession.topRIR === 0 || (latestSession.topRPE && latestSession.topRPE >= 9.5)) {
      rationales.push(`High perceived exertion / zero reserve suggests systemic or localized fatigue accumulation.`);
    }

    summary = `Regressing: Performance has declined across recent sessions (-${Math.abs(deltaE1RM)}kg e1RM). Consider fatigue management.`;

    // Next Target for REGRESSING:
    // Conservative target: either maintain weight with a lower rep target, or small deload (-5% to -10%)
    const deloadWeight = Math.max(isCompound ? 20 : 5, Math.round((latestSession.topWeight * 0.925) / 2.5) * 2.5);
    nextTarget = {
      targetWeight: deloadWeight,
      targetRepsMin: Math.max(6, latestSession.topReps),
      targetRepsMax: Math.max(8, latestSession.topReps + 2),
      targetSets: Math.max(2, (latestSession.setsCount || 3) - 1),
      suggestedRIR: 3,
      action: 'DELOAD',
      rationale: `Fatigue mitigation: Modulate load to ${deloadWeight}kg at RIR 3 to restore recovery and rebuild volume safely.`
    };
  } 
  // 3. STALLING CRITERIA (Plateau / unchanged within +/- 2.5%):
  else {
    state = 'STALLING';
    rationales.push(`Performance has remained approximately unchanged across the last ${history.length} logged sessions.`);
    rationales.push(`Latest: ${latestSession.topWeight}kg × ${latestSession.topReps} (e1RM ${currentE1RM}kg) vs Prior: ${previousSession.topWeight}kg × ${previousSession.topReps} (e1RM ${previousE1RM}kg).`);
    
    summary = `Stalling: Performance has remained approximately unchanged across recent sessions (e1RM delta ${deltaE1RM >= 0 ? '+' : ''}${deltaE1RM}kg).`;

    // Next Target for STALLING:
    // Do NOT blindly add weight. Hold weight steady and focus on +1 rep or adding a high-quality set.
    nextTarget = {
      targetWeight: latestSession.topWeight,
      targetRepsMin: latestSession.topReps,
      targetRepsMax: latestSession.topReps + 1,
      targetSets: latestSession.setsCount || 3,
      suggestedRIR: 2,
      action: 'MAINTAIN',
      rationale: `Plateau detected: Hold weight at ${latestSession.topWeight}kg. Focus on breaking the stall with +1 clean repetition before increasing weight.`
    };
  }

  return {
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
      volume: latestSession.totalVolume
    },
    summary,
    rationales,
    nextTarget,
    history: mappedHistory
  };
}
