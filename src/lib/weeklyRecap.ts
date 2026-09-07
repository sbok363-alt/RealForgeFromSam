import { Workout, WorkoutSetItem } from '../types';
import { analyzeExerciseProgression, calculateE1RM } from './progression';
import { calculatePhysiqueHypertrophyVolume } from './hypertrophy';

export interface WeeklyRecapExerciseHighlight {
  exercise: string;
  state: 'PROGRESSING' | 'STALLING' | 'REGRESSING' | 'INSUFFICIENT_DATA';
  deltaE1RM: number;
  message: string;
}

export interface WeeklyRecap {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;
  sessionsCompleted: number;
  sessionsPlanned: number;
  totalVolumeKg: number;
  totalSets: number;
  avgSetsPerSession: number;
  consistencyScore: number; // 0–100 vs target 3+/week
  prCount: number;
  topExercises: WeeklyRecapExerciseHighlight[];
  muscleNotes: string[];
  headline: string;
  coachNote: string;
  nextFocus: string;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isCompleted(w: Workout): boolean {
  return w.status === 'COMPLETED' || w.status === 'completed';
}

function sessionVolume(w: Workout): number {
  let vol = 0;
  for (const s of w.sets || []) {
    if (s.weight > 0 && s.reps > 0) vol += s.weight * s.reps;
  }
  return vol;
}

function countPRsInWeek(workouts: Workout[], weekStart: Date, weekEnd: Date): number {
  // Approximate: any completed set in-week whose e1RM beats prior history for that exercise
  const priorMax: Record<string, number> = {};
  const sorted = [...workouts]
    .filter(isCompleted)
    .sort((a, b) => new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime());

  let prs = 0;
  for (const w of sorted) {
    const ts = new Date(w.scheduledDate || 0).getTime();
    const inWeek = ts >= weekStart.getTime() && ts <= weekEnd.getTime();
    for (const s of w.sets || []) {
      if (!s.exercise || s.weight <= 0 || s.reps <= 0) continue;
      if (s.completed === false) continue;
      const key = s.exercise.toLowerCase().replace(/[-_\s]+/g, '');
      const e1 = calculateE1RM(s.weight, s.reps, s.rir);
      const prev = priorMax[key] || 0;
      if (inWeek && prev > 0 && e1 > prev + 0.5) {
        prs++;
      }
      if (e1 > prev) priorMax[key] = e1;
    }
  }
  return prs;
}

const MAIN_LIFTS = [
  'Barbell Bench Press',
  'Back Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
];

/**
 * Deterministic weekly recap from workout history.
 * No LLM required — safe offline and cheap.
 */
export function buildWeeklyRecap(
  workouts: Workout[],
  options?: { referenceDate?: Date; targetSessionsPerWeek?: number }
): WeeklyRecap {
  const ref = options?.referenceDate || new Date();
  const target = options?.targetSessionsPerWeek ?? 3;

  // Recap the *previous* full week (Mon–Sun) so Monday feels like report day
  const thisMonday = startOfWeekMonday(ref);
  const weekStart = new Date(thisMonday);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startStr = toDateStr(weekStart);
  const endStr = toDateStr(weekEnd);

  const inRange = (w: Workout) => {
    const d = w.scheduledDate || '';
    return d >= startStr && d <= endStr;
  };

  const weekWorkouts = workouts.filter(inRange);
  const completed = weekWorkouts.filter(isCompleted);
  const planned = weekWorkouts.filter(
    (w) => w.status === 'PLANNED' || w.status === 'planned' || isCompleted(w)
  );

  let totalVolume = 0;
  let totalSets = 0;
  for (const w of completed) {
    totalVolume += sessionVolume(w);
    totalSets += (w.sets || []).filter((s) => s.weight > 0 && s.reps > 0).length;
  }

  const sessionsCompleted = completed.length;
  const consistencyScore = Math.min(100, Math.round((sessionsCompleted / target) * 100));
  const prCount = countPRsInWeek(workouts, weekStart, weekEnd);

  const topExercises: WeeklyRecapExerciseHighlight[] = [];
  for (const ex of MAIN_LIFTS) {
    try {
      const report = analyzeExerciseProgression(workouts, ex);
      if (!report || report.state === 'INSUFFICIENT_DATA') continue;
      topExercises.push({
        exercise: report.exerciseName || ex,
        state: report.state,
        deltaE1RM: report.deltaE1RM,
        message: report.summary,
      });
    } catch {
      // skip
    }
  }

  // Prefer interesting ones first
  topExercises.sort((a, b) => {
    const rank = (s: string) =>
      s === 'REGRESSING' ? 0 : s === 'STALLING' ? 1 : s === 'PROGRESSING' ? 2 : 3;
    return rank(a.state) - rank(b.state);
  });

  const hypertrophy = calculatePhysiqueHypertrophyVolume(workouts);
  const muscleNotes: string[] = [];
  if (hypertrophy.hasTwoWeekDeficit && hypertrophy.deficientMuscles?.length) {
    muscleNotes.push(
      `Hypertrophy lag: ${hypertrophy.deficientMuscles.map((m: any) => m.muscle).join(', ')} below target for 2 weeks.`
    );
  }

  // Headline + coach note (deterministic copy)
  let headline = 'Quiet week.';
  let coachNote = 'Show up this week. Consistency beats intensity when volume is low.';
  let nextFocus = 'Lock in 3 sessions and log every set.';

  if (sessionsCompleted >= target + 1) {
    headline = 'Strong volume week.';
    coachNote = `You completed ${sessionsCompleted} sessions and moved ${Math.round(totalVolume).toLocaleString()} kg. Recovery and progressive overload are the next levers.`;
    nextFocus = 'Keep the frequency; push load only where RIR stays ≥1.';
  } else if (sessionsCompleted >= target) {
    headline = 'On target.';
    coachNote = `${sessionsCompleted} sessions logged — solid baseline. ${prCount > 0 ? `${prCount} PR signal${prCount > 1 ? 's' : ''} this week.` : 'Chase one small PR next week.'}`;
    nextFocus = prCount > 0 ? 'Consolidate gains; add 1 back-off set on your best lift.' : 'Pick one main lift and force a rep PR.';
  } else if (sessionsCompleted > 0) {
    headline = 'Partial week.';
    coachNote = `Only ${sessionsCompleted} session${sessionsCompleted > 1 ? 's' : ''} completed. The plan only works when it meets the floor.`;
    nextFocus = `Aim for ${target} sessions. Protect the first one of the week no matter what.`;
  }

  const progressing = topExercises.filter((t) => t.state === 'PROGRESSING');
  const struggling = topExercises.filter((t) => t.state === 'STALLING' || t.state === 'REGRESSING');
  if (struggling.length && sessionsCompleted > 0) {
    coachNote += ` Watch: ${struggling[0].exercise} looks ${struggling[0].state.toLowerCase()}.`;
    nextFocus = `Address ${struggling[0].exercise} — technique, sleep, or a planned deload beat ego loading.`;
  } else if (progressing.length && sessionsCompleted >= target) {
    coachNote += ` ${progressing[0].exercise} is moving (+${progressing[0].deltaE1RM}kg e1RM).`;
  }

  if (muscleNotes.length) {
    nextFocus = muscleNotes[0];
  }

  return {
    weekStart: startStr,
    weekEnd: endStr,
    sessionsCompleted,
    sessionsPlanned: planned.length,
    totalVolumeKg: Math.round(totalVolume),
    totalSets,
    avgSetsPerSession: sessionsCompleted ? Math.round((totalSets / sessionsCompleted) * 10) / 10 : 0,
    consistencyScore,
    prCount,
    topExercises: topExercises.slice(0, 4),
    muscleNotes,
    headline,
    coachNote,
    nextFocus,
  };
}

/** True if user hasn't dismissed this week's recap yet */
export function shouldShowWeeklyRecapBanner(userId: string, weekStart: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = `forge_recap_seen_${userId}_${weekStart}`;
  return localStorage.getItem(key) !== 'true';
}

export function markWeeklyRecapSeen(userId: string, weekStart: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`forge_recap_seen_${userId}_${weekStart}`, 'true');
}
