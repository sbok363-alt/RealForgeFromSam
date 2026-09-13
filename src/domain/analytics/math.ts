/**
 * Calculates Estimated 1RM using FORGE's existing Epley policy.
 *
 * The formula and rounding are intentionally unchanged from the legacy
 * progression implementation. RIR is numeric metadata and is clamped to the
 * 0..5 range used by this calculation.
 */
export function calculateE1RM(weight: number, reps: number, rir?: number | null): number {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return 0;
  if (typeof reps !== 'number' || !Number.isFinite(reps) || reps <= 0) return 0;

  let validRir = 0;
  if (typeof rir === 'number' && Number.isFinite(rir)) {
    validRir = Math.max(0, Math.min(rir, 5));
  }

  if (reps === 1 && validRir === 0) return weight;
  const effectiveReps = reps + validRir;
  const value = Math.round((weight * (1 + effectiveReps / 30)) * 10) / 10;
  return Number.isFinite(value) ? value : 0;
}
