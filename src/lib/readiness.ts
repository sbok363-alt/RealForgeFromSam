export type ReadinessScore = 1 | 2 | 3 | 4 | 5;

export interface ReadinessInput {
  sleep: ReadinessScore;
  soreness: ReadinessScore; // 1 = wrecked, 5 = fresh
  motivation: ReadinessScore;
  stress: ReadinessScore; // 1 = max stress, 5 = calm
}

export interface ReadinessResult {
  score: number; // 0–100
  level: 'low' | 'moderate' | 'high';
  volumeModifier: number; // 0.7–1.05
  loadModifier: number; // 0.9–1.0 (only reduce, never ego-load)
  summary: string;
  prescription: string;
}

export function scoreReadiness(input: ReadinessInput): ReadinessResult {
  // Higher is better for all four after normalizing stress/soreness
  const sleep = input.sleep;
  const fresh = input.soreness;
  const motivation = input.motivation;
  const calm = input.stress;

  const raw = ((sleep + fresh + motivation + calm) / 20) * 100;
  const score = Math.round(raw);

  let level: ReadinessResult['level'] = 'moderate';
  let volumeModifier = 1;
  let loadModifier = 1;
  let summary = 'You’re in a workable state.';
  let prescription = 'Train as planned. Chase quality reps.';

  if (score >= 80) {
    level = 'high';
    volumeModifier = 1.05;
    loadModifier = 1;
    summary = 'High readiness — good day to push.';
    prescription = 'Keep planned loads. Optional +1 hard set on your best lift.';
  } else if (score >= 55) {
    level = 'moderate';
    volumeModifier = 1;
    loadModifier = 1;
    summary = 'Solid enough to train the plan.';
    prescription = 'Stick to targets. Stop a set early if form slips.';
  } else {
    level = 'low';
    volumeModifier = 0.75;
    loadModifier = 0.9;
    summary = 'Recovery is limited — protect the long game.';
    prescription = 'Reduce volume ~25% and drop loads ~10%. Technique over ego.';
  }

  // Extreme single-factor overrides
  if (input.soreness <= 2 || input.sleep <= 2) {
    level = 'low';
    volumeModifier = Math.min(volumeModifier, 0.75);
    loadModifier = Math.min(loadModifier, 0.9);
    summary = 'Fatigue or poor sleep flagged.';
    prescription = 'Cut volume and load. Consider this a primer session.';
  }

  return { score, level, volumeModifier, loadModifier, summary, prescription };
}

/** Apply modifiers to a set list (deterministic). */
export function applyReadinessToSets<
  T extends { weight: number; reps: number; exercise?: string }
>(
  sets: T[],
  result: ReadinessResult
): { sets: T[]; changed: number } {
  if (result.level === 'high' || result.level === 'moderate') {
    // moderate: no silent changes; high: optional volume is a coach note only
    return { sets, changed: 0 };
  }

  let changed = 0;
  const next = sets.map((s) => {
    if (s.weight <= 0) return s;
    const w = Math.round(s.weight * result.loadModifier * 2) / 2; // 0.5kg steps
    if (w !== s.weight) changed++;
    return { ...s, weight: Math.max(0, w) };
  });

  // Drop ~25% of working sets from the end of each exercise group if low
  if (result.volumeModifier < 1) {
    const byEx = new Map<string, T[]>();
    for (const s of next) {
      const k = s.exercise || '_';
      if (!byEx.has(k)) byEx.set(k, []);
      byEx.get(k)!.push(s);
    }
    const trimmed: T[] = [];
    for (const [, group] of byEx) {
      const keep = Math.max(1, Math.ceil(group.length * result.volumeModifier));
      if (keep < group.length) changed += group.length - keep;
      trimmed.push(...group.slice(0, keep));
    }
    return { sets: trimmed, changed };
  }

  return { sets: next, changed };
}
