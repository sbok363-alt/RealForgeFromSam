import { MuscleGroup, getExerciseById, getExerciseByName } from './exercises';
import { Workout, WorkoutSetItem } from '../types';

export type HypertrophyThresholds = Record<MuscleGroup, number>;

export const DEFAULT_HYPERTROPHY_THRESHOLDS: HypertrophyThresholds = {
  CHEST: 10,
  BACK: 12,
  SHOULDERS: 10,
  LEGS: 12,
  ARMS: 8,
  CORE: 6,
  FULL_BODY: 10
};

export interface MuscleVolumeWeekly {
  muscle: MuscleGroup;
  muscleLabel: string;
  week1Sets: number; // Most recent 7 days
  week2Sets: number; // 8–14 days ago
  week3Sets: number; // 15–21 days ago
  targetThreshold: number; // User-defined optimal weekly sets target
  week1Percentage: number;
  week2Percentage: number;
  isWeek1Below: boolean;
  isWeek2Below: boolean;
  isTwoWeekDeficit: boolean; // Flagged if below threshold for 2 consecutive weeks
  consecutiveWeeksBelow: number;
  deficitSetsWeek1: number;
  deficitSetsWeek2: number;
  recentExercises: string[];
  lastTrainedTimestamp?: number;
  daysSinceLastTrained?: number;
  recoveryStatus?: 'FATIGUED' | 'RECOVERING' | 'PRIMED' | 'RESTED';
}

export interface PhysiqueSymmetryAudit {
  pushSets: number;
  pullSets: number;
  legSets: number;
  coreSets: number;
  upperSets: number;
  lowerSets: number;
  pushPullRatio: number;
  upperLowerRatio: number;
  balanceScore: number; // 0 - 100
  feedback: string;
}

export interface HypertrophyAuditResult {
  muscles: Record<MuscleGroup, MuscleVolumeWeekly>;
  deficientMuscles: MuscleVolumeWeekly[];
  hasTwoWeekDeficit: boolean;
  totalDeficientMusclesCount: number;
  week1RangeStr: string;
  week2RangeStr: string;
  evaluatedAt: number;
  symmetry: PhysiqueSymmetryAudit;
}

const STORAGE_KEY = 'forge_hypertrophy_thresholds_v1';

export function getStoredHypertrophyThresholds(): HypertrophyThresholds {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...DEFAULT_HYPERTROPHY_THRESHOLDS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_HYPERTROPHY_THRESHOLDS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load stored hypertrophy thresholds', e);
  }
  return { ...DEFAULT_HYPERTROPHY_THRESHOLDS };
}

export function saveStoredHypertrophyThresholds(thresholds: HypertrophyThresholds): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  } catch (e) {
    console.error('Failed to save hypertrophy thresholds', e);
  }
}

/**
 * Calculates weekly completed sets for each muscle group across the last two consecutive 7-day cycles.
 * Highlights muscle groups that have fallen below the user's defined 'Optimal Hypertrophy' threshold
 * for both consecutive weeks.
 */
export function calculatePhysiqueHypertrophyVolume(
  workouts: Workout[],
  customThresholds?: Partial<HypertrophyThresholds>,
  includeSecondaryMuscles: boolean = true
): HypertrophyAuditResult {
  const thresholds: HypertrophyThresholds = {
    ...getStoredHypertrophyThresholds(),
    ...(customThresholds || {})
  };

  const now = Date.now();
  const ONE_DAY_MS = 86400000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  const week1Cutoff = now - SEVEN_DAYS_MS;
  const week2Cutoff = now - (14 * ONE_DAY_MS);
  const week3Cutoff = now - (21 * ONE_DAY_MS);

  const muscleGroups: MuscleGroup[] = ['CHEST', 'BACK', 'SHOULDERS', 'LEGS', 'ARMS', 'CORE'];

  const weeklySets: Record<MuscleGroup, { 
    w1: number; 
    w2: number; 
    w3: number; 
    exercises: Set<string>;
    lastTrained: number | null;
  }> = {
    CHEST: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    BACK: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    SHOULDERS: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    LEGS: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    ARMS: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    CORE: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null },
    FULL_BODY: { w1: 0, w2: 0, w3: 0, exercises: new Set(), lastTrained: null }
  };

  // Filter completed workouts
  const completedWorkouts = workouts.filter(w => {
    const isCompletedStatus = w.status === 'COMPLETED' || w.status === 'completed';
    const hasCompletedSets = Array.isArray(w.sets) && w.sets.some(s => s.completed);
    const hasCompletedExSets = Array.isArray(w.exercises) && w.exercises.some(e => e.sets?.some(s => s.completed));
    return isCompletedStatus || hasCompletedSets || hasCompletedExSets;
  });

  completedWorkouts.forEach(w => {
    // Resolve workout completion date
    let timestamp = w.completedAt || w.startedAt;
    if (!timestamp && w.scheduledDate) {
      const parsed = new Date(w.scheduledDate).getTime();
      if (!isNaN(parsed)) timestamp = parsed;
    }
    if (!timestamp) return;

    let targetWeek: 'w1' | 'w2' | 'w3' | null = null;
    if (timestamp >= week1Cutoff && timestamp <= now) {
      targetWeek = 'w1';
    } else if (timestamp >= week2Cutoff && timestamp < week1Cutoff) {
      targetWeek = 'w2';
    } else if (timestamp >= week3Cutoff && timestamp < week2Cutoff) {
      targetWeek = 'w3';
    }

    // Process set items
    const recordSet = (exerciseNameOrId: string, isCompleted: boolean) => {
      if (!isCompleted || !exerciseNameOrId) return;
      const def = getExerciseById(exerciseNameOrId) || getExerciseByName(exerciseNameOrId);
      if (!def) return;

      const primary = def.primaryMuscle;
      if (weeklySets[primary]) {
        if (targetWeek) {
          weeklySets[primary][targetWeek] += 1;
        }
        weeklySets[primary].exercises.add(def.name);
        if (!weeklySets[primary].lastTrained || timestamp > weeklySets[primary].lastTrained!) {
          weeklySets[primary].lastTrained = timestamp;
        }
      }

      if (includeSecondaryMuscles && def.secondaryMuscles) {
        def.secondaryMuscles.forEach(sec => {
          if (weeklySets[sec] && sec !== primary) {
            // Secondary muscle receives fractional credit (0.5 set stimulus)
            if (targetWeek) {
              weeklySets[sec][targetWeek] += 0.5;
            }
            weeklySets[sec].exercises.add(def.name);
            if (!weeklySets[sec].lastTrained || timestamp > weeklySets[sec].lastTrained!) {
              weeklySets[sec].lastTrained = timestamp;
            }
          }
        });
      }
    };

    if (Array.isArray(w.sets)) {
      w.sets.forEach(s => {
        if (s.completed && s.exercise) {
          recordSet(s.exercise, true);
        }
      });
    }

    if (Array.isArray(w.exercises)) {
      w.exercises.forEach(ex => {
        const exName = ex.name || ex.exerciseId;
        ex.sets?.forEach(s => {
          if (s.completed) {
            recordSet(exName, true);
          }
        });
      });
    }
  });

  const musclesMap: Record<MuscleGroup, MuscleVolumeWeekly> = {} as any;
  const deficientMuscles: MuscleVolumeWeekly[] = [];

  muscleGroups.forEach(muscle => {
    const data = weeklySets[muscle];
    const threshold = thresholds[muscle] || 10;
    const w1 = Math.round(data.w1 * 10) / 10;
    const w2 = Math.round(data.w2 * 10) / 10;
    const w3 = Math.round(data.w3 * 10) / 10;

    const isWeek1Below = w1 < threshold;
    const isWeek2Below = w2 < threshold;
    const isWeek3Below = w3 < threshold;

    // Check if user has logged any workouts in the active monitoring window
    const hasWorkoutsInPeriod = workouts.length > 0 && workouts.some(w => {
      const ts = w.startedAt || (w.scheduledDate ? new Date(w.scheduledDate).getTime() : 0);
      return ts > 0 && (now - ts) <= (21 * ONE_DAY_MS);
    });

    // Consecutive 2-week deficit condition:
    // Only flagged if the user has an active training history in the period
    const isTwoWeekDeficit = hasWorkoutsInPeriod && isWeek1Below && isWeek2Below;

    let consecutiveWeeksBelow = 0;
    if (isWeek1Below) {
      consecutiveWeeksBelow = 1;
      if (isWeek2Below) {
        consecutiveWeeksBelow = 2;
        if (isWeek3Below) {
          consecutiveWeeksBelow = 3;
        }
      }
    }

    const muscleLabels: Record<MuscleGroup, string> = {
      CHEST: 'Chest (Pectorals)',
      BACK: 'Back (Lats & Traps)',
      SHOULDERS: 'Shoulders (Deltoids)',
      LEGS: 'Legs (Quads & Hamstrings)',
      ARMS: 'Arms (Biceps & Triceps)',
      CORE: 'Core (Abs & Obliques)',
      FULL_BODY: 'Full Body'
    };

    // Calculate recovery and freshness from last training session
    let daysSinceLastTrained: number | undefined = undefined;
    let recoveryStatus: 'FATIGUED' | 'RECOVERING' | 'PRIMED' | 'RESTED' = 'RESTED';

    if (data.lastTrained) {
      const diffMs = Math.max(0, now - data.lastTrained);
      daysSinceLastTrained = Math.floor(diffMs / ONE_DAY_MS);
      const hours = diffMs / 3600000;
      if (hours < 24) {
        recoveryStatus = 'FATIGUED';
      } else if (hours < 48) {
        recoveryStatus = 'RECOVERING';
      } else if (hours <= 120) {
        recoveryStatus = 'PRIMED';
      } else {
        recoveryStatus = 'RESTED';
      }
    }

    const volumeItem: MuscleVolumeWeekly = {
      muscle,
      muscleLabel: muscleLabels[muscle],
      week1Sets: w1,
      week2Sets: w2,
      week3Sets: w3,
      targetThreshold: threshold,
      week1Percentage: Math.min(100, Math.round((w1 / threshold) * 100)),
      week2Percentage: Math.min(100, Math.round((w2 / threshold) * 100)),
      isWeek1Below,
      isWeek2Below,
      isTwoWeekDeficit,
      consecutiveWeeksBelow,
      deficitSetsWeek1: Math.max(0, Math.round((threshold - w1) * 10) / 10),
      deficitSetsWeek2: Math.max(0, Math.round((threshold - w2) * 10) / 10),
      recentExercises: Array.from(data.exercises).slice(0, 6),
      lastTrainedTimestamp: data.lastTrained || undefined,
      daysSinceLastTrained,
      recoveryStatus
    };

    musclesMap[muscle] = volumeItem;

    if (isTwoWeekDeficit) {
      deficientMuscles.push(volumeItem);
    }
  });

  // Calculate Symmetry & Balance Metrics
  const chestSets = weeklySets.CHEST.w1;
  const backSets = weeklySets.BACK.w1;
  const shoulderSets = weeklySets.SHOULDERS.w1;
  const legSets = weeklySets.LEGS.w1;
  const armSets = weeklySets.ARMS.w1;
  const coreSets = weeklySets.CORE.w1;

  const pushSets = Math.round((chestSets + shoulderSets + armSets * 0.5) * 10) / 10;
  const pullSets = Math.round((backSets + armSets * 0.5) * 10) / 10;
  const upperSets = Math.round((pushSets + pullSets + coreSets * 0.5) * 10) / 10;
  const lowerSets = legSets;

  const pushPullRatio = pullSets > 0 ? Math.round((pushSets / pullSets) * 100) / 100 : (pushSets > 0 ? 2.0 : 1.0);
  const upperLowerRatio = lowerSets > 0 ? Math.round((upperSets / lowerSets) * 100) / 100 : (upperSets > 0 ? 2.5 : 1.0);

  // Score balance out of 100
  let balanceScore = 100;
  let feedback = 'Balanced muscular volume distribution across push, pull, and leg kinetic chains.';

  if (pushPullRatio > 1.4) {
    balanceScore -= 20;
    feedback = 'Push-dominant volume: Prioritize rows and pull-ups to balance scapular posture and rear deltoid development.';
  } else if (pushPullRatio < 0.7) {
    balanceScore -= 15;
    feedback = 'Pull-dominant volume: Increase chest and overhead pressing to balance anterior upper body stimulus.';
  }

  if (upperLowerRatio > 2.2) {
    balanceScore -= 20;
    feedback = 'Upper-body dominant: Leg volume is lagging behind upper body work. Consider dedicating a focused lower body session.';
  } else if (upperLowerRatio < 0.6) {
    balanceScore -= 15;
    feedback = 'Lower-body dominant: Upper kinetic chain volume is low relative to lower body stimulus.';
  }

  const symmetry: PhysiqueSymmetryAudit = {
    pushSets,
    pullSets,
    legSets,
    coreSets,
    upperSets,
    lowerSets,
    pushPullRatio,
    upperLowerRatio,
    balanceScore: Math.max(40, balanceScore),
    feedback
  };

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const w1Start = new Date(week1Cutoff);
  const w1End = new Date(now);
  const w2Start = new Date(week2Cutoff);
  const w2End = new Date(week1Cutoff);

  return {
    muscles: musclesMap,
    deficientMuscles,
    hasTwoWeekDeficit: deficientMuscles.length > 0,
    totalDeficientMusclesCount: deficientMuscles.length,
    week1RangeStr: `${formatDate(w1Start)} – ${formatDate(w1End)} (Current Week)`,
    week2RangeStr: `${formatDate(w2Start)} – ${formatDate(w2End)} (Prior Week)`,
    evaluatedAt: now,
    symmetry
  };
}

/**
 * Generates sample 2-week progressive hypertrophy workouts for demo / preview mode
 */
export function generateDemoHypertrophyWorkouts(): Workout[] {
  const now = Date.now();
  const ONE_DAY_MS = 86400000;

  const mkWorkout = (
    id: string, 
    name: string, 
    daysAgo: number, 
    exercises: Array<{ name: string; setsCount: number; reps: number; weight: number }>
  ): Workout => {
    const time = now - daysAgo * ONE_DAY_MS;
    const setsItems: WorkoutSetItem[] = exercises.flatMap((ex, i) => 
      Array.from({ length: ex.setsCount }).map((_, sIdx) => ({
        id: `s-${id}-${i}-${sIdx}`,
        exercise: ex.name,
        reps: ex.reps,
        weight: ex.weight,
        completed: true,
        rpe: 8
      }))
    );

    return {
      id,
      title: name,
      scheduledDate: new Date(time).toISOString().split('T')[0],
      status: 'COMPLETED',
      version: 1,
      startedAt: time,
      completedAt: time + 3600000,
      sets: setsItems,
      exercises: exercises.map((ex, i) => ({
        id: `ex-${id}-${i}`,
        exerciseId: ex.name.toLowerCase().replace(/\s+/g, '_'),
        name: ex.name,
        sets: Array.from({ length: ex.setsCount }).map((_, sIdx) => ({
          id: `s-${id}-${i}-${sIdx}`,
          reps: ex.reps,
          weight: ex.weight,
          completed: true,
          rpe: 8
        }))
      }))
    };
  };

  return [
    // Current week workouts
    mkWorkout('demo-w1-push', 'Heavy Upper Push Day', 1, [
      { name: 'Barbell Bench Press', setsCount: 4, reps: 8, weight: 185 },
      { name: 'Overhead Press (OHP)', setsCount: 4, reps: 8, weight: 115 },
      { name: 'Incline Dumbbell Press', setsCount: 3, reps: 10, weight: 65 },
      { name: 'Tricep Rope Pushdown', setsCount: 3, reps: 12, weight: 50 },
      { name: 'Lateral Raise', setsCount: 4, reps: 15, weight: 25 }
    ]),
    mkWorkout('demo-w1-pull', 'Back & Bicep Hypertrophy', 3, [
      { name: 'Barbell Deadlift', setsCount: 4, reps: 6, weight: 275 },
      { name: 'Lat Pulldown', setsCount: 4, reps: 10, weight: 140 },
      { name: 'Barbell Bent Over Row', setsCount: 4, reps: 8, weight: 155 },
      { name: 'Barbell Bicep Curl', setsCount: 4, reps: 10, weight: 70 },
      { name: 'Face Pull', setsCount: 3, reps: 15, weight: 45 }
    ]),
    mkWorkout('demo-w1-core', 'Core & Stability Flush', 5, [
      { name: 'Hanging Leg Raise', setsCount: 4, reps: 12, weight: 0 },
      { name: 'Cable Woodchopper', setsCount: 3, reps: 12, weight: 35 },
      { name: 'Plank', setsCount: 3, reps: 60, weight: 0 }
    ]),
    // Prior week workouts (Legs intentionally left minimal to demonstrate the 2-week deficit alert!)
    mkWorkout('demo-w2-push', 'Upper Push Hypertrophy', 8, [
      { name: 'Barbell Bench Press', setsCount: 4, reps: 8, weight: 180 },
      { name: 'Incline Dumbbell Press', setsCount: 3, reps: 10, weight: 60 },
      { name: 'Dumbbell Shoulder Press', setsCount: 3, reps: 10, weight: 50 },
      { name: 'Cable Lateral Raise', setsCount: 3, reps: 15, weight: 20 }
    ]),
    mkWorkout('demo-w2-pull', 'Back Density Pull', 10, [
      { name: 'Pull-Up', setsCount: 4, reps: 8, weight: 0 },
      { name: 'Seated Cable Row', setsCount: 4, reps: 10, weight: 135 },
      { name: 'Hammer Curl', setsCount: 3, reps: 12, weight: 35 }
    ]),
    mkWorkout('demo-w2-arms', 'Arms & Shoulders Blast', 12, [
      { name: 'Dumbbell Bicep Curl', setsCount: 3, reps: 10, weight: 35 },
      { name: 'Overhead Tricep Extension', setsCount: 3, reps: 12, weight: 50 },
      { name: 'Lateral Raise', setsCount: 4, reps: 15, weight: 25 }
    ])
  ];
}
