import { EXERCISE_DATABASE } from '../../lib/exercises';
import type { ExerciseReference } from '../canonical';

/** Stable comparison form for identifiers at the analytics boundary. */
export function normalizeExerciseIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[-_\s]+/g, '_');
}

/**
 * Deliberately small and explicit compatibility aliases. This table is not a
 * fuzzy matcher: every entry names one catalog identity that was observed in
 * existing FORGE data or callers.
 */
export const EXERCISE_ANALYTICS_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Existing callers use "Barbell Squat"/"Back Squat" while the catalog's
  // canonical entry is `squat` (named Barbell Back Squat).
  'barbell_squat': 'squat',
  'squats': 'squat',
  'back_squat': 'squat',
});

/** Inputs whose historical substring behavior was intrinsically ambiguous. */
export const AMBIGUOUS_EXERCISE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  press: ['bench_press', 'incline_bench_press', 'dumbbell_bench_press', 'incline_dumbbell_press', 'overhead_press', 'dumbbell_shoulder_press'],
  bench: ['bench_press', 'incline_bench_press', 'dumbbell_bench_press', 'incline_dumbbell_press'],
  row: ['seated_cable_row', 'chest_supported_row', 'barbell_row', 'single_arm_dumbbell_row'],
});

export type ExerciseIdentityResolution =
  | { kind: 'catalog'; exerciseId: string; matchedBy: 'id' | 'name' | 'alias'; normalized: string }
  | { kind: 'unresolved'; normalized: string; original: string }
  | { kind: 'ambiguous'; normalized: string; original: string; candidates: readonly string[] };

const catalogMatches = (normalized: string): { id: string; by: 'id' | 'name' }[] => EXERCISE_DATABASE
  .filter(entry => normalizeExerciseIdentifier(entry.id) === normalized || normalizeExerciseIdentifier(entry.name) === normalized)
  .map(entry => ({ id: entry.id, by: normalizeExerciseIdentifier(entry.id) === normalized ? 'id' as const : 'name' as const }));

export function resolveAnalyticsExercise(identifier: string): ExerciseIdentityResolution {
  const normalized = normalizeExerciseIdentifier(identifier);
  if (!normalized) return { kind: 'unresolved', normalized, original: identifier };

  const matches = catalogMatches(normalized);
  const uniqueMatches = [...new Map(matches.map(match => [match.id, match])).values()];
  if (uniqueMatches.length === 1) {
    const match = uniqueMatches[0]!;
    return { kind: 'catalog', exerciseId: match.id, matchedBy: match.by, normalized };
  }
  if (uniqueMatches.length > 1) {
    return { kind: 'ambiguous', normalized, original: identifier, candidates: uniqueMatches.map(match => match.id) };
  }

  const ambiguous = AMBIGUOUS_EXERCISE_ALIASES[normalized];
  if (ambiguous) return { kind: 'ambiguous', normalized, original: identifier, candidates: ambiguous };

  const alias = EXERCISE_ANALYTICS_ALIASES[normalized];
  if (alias) return { kind: 'catalog', exerciseId: alias, matchedBy: 'alias', normalized };
  return { kind: 'unresolved', normalized, original: identifier };
}

/** Resolve an on-session canonical reference without broad string matching. */
export function resolveCanonicalReference(reference: ExerciseReference): ExerciseIdentityResolution {
  if (reference.kind === 'catalog') {
    return { kind: 'catalog', exerciseId: reference.exerciseId, matchedBy: 'id', normalized: normalizeExerciseIdentifier(reference.exerciseId) };
  }
  const byIdentifier = resolveAnalyticsExercise(reference.legacyIdentifier);
  if (byIdentifier.kind !== 'unresolved') return byIdentifier;
  if (reference.label !== reference.legacyIdentifier) {
    const byLabel = resolveAnalyticsExercise(reference.label);
    if (byLabel.kind !== 'unresolved') return byLabel;
  }
  return { kind: 'unresolved', normalized: normalizeExerciseIdentifier(reference.legacyIdentifier), original: reference.legacyIdentifier };
}

export function matchesCanonicalExerciseReference(reference: ExerciseReference, target: ExerciseIdentityResolution): boolean {
  if (target.kind === 'ambiguous') return false;
  const source = resolveCanonicalReference(reference);
  if (target.kind === 'catalog') return source.kind === 'catalog' && source.exerciseId === target.exerciseId;
  return reference.kind === 'unresolved' && (
    normalizeExerciseIdentifier(reference.legacyIdentifier) === target.normalized ||
    normalizeExerciseIdentifier(reference.label) === target.normalized
  );
}
