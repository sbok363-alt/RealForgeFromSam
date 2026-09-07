import { Workout } from '../types';
import { extractExerciseHistory } from './progression';

export interface ProgressionRule {
  exercise: string;
  /** Hit this many reps (at or above) on all working sets */
  targetReps: number;
  /** Required RIR minimum (e.g. 2 = left 2 in tank) */
  minRir: number;
  /** kg to add when rule fires */
  weightIncrement: number;
  enabled: boolean;
}

export interface RuleFireResult {
  exercise: string;
  rule: ProgressionRule;
  lastTop: { weight: number; reps: number; rir?: number };
  suggestedWeight: number;
  reason: string;
}

const STORAGE_KEY = (userId: string) => `forge_prog_rules_${userId}`;

export const DEFAULT_RULES: ProgressionRule[] = [
  { exercise: 'Barbell Bench Press', targetReps: 8, minRir: 1, weightIncrement: 2.5, enabled: true },
  { exercise: 'Back Squat', targetReps: 5, minRir: 1, weightIncrement: 2.5, enabled: true },
  { exercise: 'Deadlift', targetReps: 5, minRir: 1, weightIncrement: 2.5, enabled: true },
  { exercise: 'Overhead Press', targetReps: 6, minRir: 1, weightIncrement: 2.5, enabled: true },
  { exercise: 'Barbell Row', targetReps: 8, minRir: 1, weightIncrement: 2.5, enabled: true },
];

export function loadRules(userId: string): ProgressionRule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return DEFAULT_RULES;
    return JSON.parse(raw) as ProgressionRule[];
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveRules(userId: string, rules: ProgressionRule[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(rules));
}

/**
 * Evaluate which rules would fire based on the *last completed session*
 * for each exercise. Deterministic — no LLM.
 */
export function evaluateProgressionRules(
  workouts: Workout[],
  rules: ProgressionRule[]
): RuleFireResult[] {
  const results: RuleFireResult[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const history = extractExerciseHistory(workouts, rule.exercise);
    if (!history.length) continue;

    const last = history[history.length - 1];
    const working = (last.sets || []).filter(
      (s) => s.weight > 0 && s.reps > 0 && (s as any).setType !== 'W'
    );
    if (working.length < 1) continue;

    // All working sets hit target reps with enough RIR
    const allHit = working.every((s) => {
      const rirOk = s.rir === undefined || s.rir >= rule.minRir;
      return s.reps >= rule.targetReps && rirOk;
    });

    if (!allHit) continue;

    // Same weight across working sets preferred; use top weight
    const topWeight = last.topWeight;
    results.push({
      exercise: rule.exercise,
      rule,
      lastTop: { weight: topWeight, reps: last.topReps, rir: last.topRIR },
      suggestedWeight: Math.round((topWeight + rule.weightIncrement) * 2) / 2,
      reason: `Hit ≥${rule.targetReps} reps @ RIR≥${rule.minRir} on last session. Rule: +${rule.weightIncrement}kg.`,
    });
  }

  return results;
}
