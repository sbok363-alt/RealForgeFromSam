import { Workout } from '../types';
import { analyzeExerciseProgression } from './progression';
import { buildWeeklyRecap } from './weeklyRecap';

export interface DeloadRecommendation {
  shouldDeload: boolean;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  volumeCutPct: number; // e.g. 40
  loadCutPct: number; // e.g. 10
  durationDays: number;
  headline: string;
  coachNote: string;
  affectedLifts: string[];
}

const MAIN = [
  'Barbell Bench Press',
  'Back Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
];

/**
 * Deterministic deload signal from stalls/regresses + recent volume consistency.
 * Never auto-applies — UI must propose and user accepts.
 */
export function evaluateDeload(workouts: Workout[]): DeloadRecommendation {
  const reasons: string[] = [];
  const affected: string[] = [];

  let stallCount = 0;
  let regressCount = 0;

  for (const ex of MAIN) {
    try {
      const report = analyzeExerciseProgression(workouts, ex);
      if (!report || report.state === 'INSUFFICIENT_DATA') continue;
      if (report.state === 'STALLING') {
        stallCount++;
        affected.push(ex);
        reasons.push(`${report.exerciseName || ex} is stalling.`);
      }
      if (report.state === 'REGRESSING') {
        regressCount++;
        affected.push(ex);
        reasons.push(`${report.exerciseName || ex} is regressing (${report.deltaE1RM}kg e1RM).`);
      }
    } catch {
      // skip
    }
  }

  const recap = buildWeeklyRecap(workouts);
  // High volume + stalls is a classic deload cue
  if (recap.sessionsCompleted >= 4 && (stallCount + regressCount) >= 2) {
    reasons.push(
      `High frequency last week (${recap.sessionsCompleted} sessions) with multiple lifts not progressing.`
    );
  }

  if (recap.consistencyScore >= 100 && stallCount >= 2) {
    reasons.push('You hit your session target but strength stalled — recovery may lag stimulus.');
  }

  const pressure = regressCount * 2 + stallCount;
  let shouldDeload = false;
  let confidence: DeloadRecommendation['confidence'] = 'low';

  if (regressCount >= 2 || pressure >= 4) {
    shouldDeload = true;
    confidence = 'high';
  } else if (regressCount >= 1 || stallCount >= 2) {
    shouldDeload = true;
    confidence = 'medium';
  } else if (stallCount >= 1 && recap.sessionsCompleted >= 4) {
    shouldDeload = true;
    confidence = 'low';
  }

  const volumeCutPct = confidence === 'high' ? 40 : confidence === 'medium' ? 35 : 30;
  const loadCutPct = confidence === 'high' ? 15 : 10;

  let headline = 'No deload needed right now.';
  let coachNote = 'Keep progressive overload where lifts are moving. Protect sleep and protein.';

  if (shouldDeload) {
    headline =
      confidence === 'high'
        ? 'Deload strongly recommended.'
        : confidence === 'medium'
        ? 'A deload week would help.'
        : 'Consider a light deload.';
    coachNote = `Cut volume ~${volumeCutPct}% and loads ~${loadCutPct}% for ${
      confidence === 'high' ? 7 : 5
    } days. Keep movement patterns; drop intensity. Return to progression after.`;
  }

  return {
    shouldDeload,
    confidence,
    reasons: reasons.slice(0, 5),
    volumeCutPct,
    loadCutPct,
    durationDays: confidence === 'high' ? 7 : 5,
    headline,
    coachNote,
    affectedLifts: [...new Set(affected)].slice(0, 5),
  };
}
