import type { TrainingSession } from '../canonical';
import { adaptLegacyWorkout, type AdapterIssue } from '../canonical/adapters';
import type { AnalyticsDiagnostic } from './contracts';

type RecordValue = Record<string, unknown>;

export interface LegacySetSource {
  representation: 'flat' | 'nested';
  exerciseIdentifier: string;
  exerciseLabel?: string;
  raw: unknown;
}

export interface LegacyAnalyticsAdapterResult {
  sessions: TrainingSession[];
  diagnostics: AnalyticsDiagnostic[];
  failures: { index: number; issues: AdapterIssue[] }[];
  /** Presentation-only source data used by the legacy output wrapper. */
  sourcesBySessionId: Map<string, Map<string, LegacySetSource[]>>;
}

export interface LegacyAnalyticsAdapterOptions {
  /** Optional authorized owner scope. Omit for the historical pure read API. */
  userId?: string;
}

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);

function decimal(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function addDiagnostic(
  diagnostics: AnalyticsDiagnostic[],
  value: Omit<AnalyticsDiagnostic, 'severity'> & { severity?: AnalyticsDiagnostic['severity'] }
): void {
  diagnostics.push({ severity: 'warning', ...value });
}

function addAdapterIssues(
  diagnostics: AnalyticsDiagnostic[],
  issues: readonly AdapterIssue[],
  severity: AnalyticsDiagnostic['severity'],
  sessionId?: string
): void {
  for (const item of issues) diagnostics.push({
    severity,
    code: item.code,
    message: item.message,
    path: item.path || undefined,
    sessionId,
  });
}

function uniqueIdentifier(value: unknown, fallback: string, used: Set<string>, diagnostics: AnalyticsDiagnostic[], path: string): string {
  let identifier = typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  if (identifier === fallback && (typeof value !== 'string' || value.trim().length === 0)) {
    addDiagnostic(diagnostics, { path, code: 'derived_id', message: 'Read-only identifier derived from source position' });
  }
  if (used.has(identifier)) {
    const original = identifier;
    let suffix = 2;
    while (used.has(`${original}__legacy_duplicate_${suffix}`)) suffix += 1;
    identifier = `${original}__legacy_duplicate_${suffix}`;
    addDiagnostic(diagnostics, { path, code: 'duplicate_id_rewritten', message: `Duplicate identifier "${original}" rewritten for canonical analytics.` });
  }
  used.add(identifier);
  return identifier;
}

function normalizeOptionalNumber(
  target: RecordValue,
  key: string,
  source: RecordValue,
  diagnostics: AnalyticsDiagnostic[],
  path: string,
  range: { min: number; max: number; integer?: boolean }
): void {
  const value = source[key];
  if (value === undefined || value === null) return;
  const parsed = decimal(value);
  if (parsed === undefined || parsed < range.min || parsed > range.max || (range.integer && !Number.isInteger(parsed))) {
    delete target[key];
    addDiagnostic(diagnostics, { path: `${path}.${key}`, code: 'invalid_optional_measurement', message: 'Invalid optional measurement omitted at the analytics boundary.' });
    return;
  }
  if (typeof value === 'string') {
    addDiagnostic(diagnostics, { path: `${path}.${key}`, code: 'numeric_string_normalized', message: 'Safe decimal optional string normalized to a canonical number.' });
  }
  target[key] = parsed;
}

function normalizeSet(
  value: unknown,
  index: number,
  path: string,
  representation: 'flat' | 'nested',
  exerciseIdentifier: string,
  usedIds: Set<string>,
  diagnostics: AnalyticsDiagnostic[],
  sources: Map<string, LegacySetSource[]>,
  exerciseLabel?: string
): RecordValue | undefined {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, { path, code: 'malformed_set', message: 'Malformed set omitted from canonical analytics input.' });
    return undefined;
  }

  const weight = decimal(value.weight);
  const reps = decimal(value.reps);
  if (weight === undefined || reps === undefined || weight < 0 || weight > 1000 || reps < 0 || reps > 200 || !Number.isInteger(reps)) {
    addDiagnostic(diagnostics, { path, code: 'invalid_measurement', message: 'Set with invalid canonical weight/reps was omitted from analytics.' });
    return undefined;
  }

  if (typeof value.weight === 'string') {
    addDiagnostic(diagnostics, { path: `${path}.weight`, code: 'numeric_string_normalized', message: 'Safe decimal weight string normalized to a canonical number.' });
  }
  if (typeof value.reps === 'string') {
    addDiagnostic(diagnostics, { path: `${path}.reps`, code: 'numeric_string_normalized', message: 'Safe decimal repetition string normalized to a canonical number.' });
  }

  const normalized: RecordValue = { ...value, weight, reps };
  normalized.id = uniqueIdentifier(value.id, `legacy-set-${index}`, usedIds, diagnostics, `${path}.id`);

  if (value.completed === null) {
    // The old extractor excluded null, while a missing flag meant unknown.
    normalized.completed = false;
    addDiagnostic(diagnostics, { path: `${path}.completed`, code: 'null_completion_excluded', message: 'Null completion treated as not completed for compatibility.' });
  } else if (value.completed !== undefined && typeof value.completed !== 'boolean') {
    addDiagnostic(diagnostics, { path: `${path}.completed`, code: 'malformed_completion', message: 'Malformed completion value caused the set to be omitted.' });
    return undefined;
  }

  if (value.setType !== undefined && value.setType !== null && !['N', 'W', 'D', 'F', 'normal'].includes(String(value.setType))) {
    delete normalized.setType;
    addDiagnostic(diagnostics, { path: `${path}.setType`, code: 'invalid_set_type', message: 'Invalid set type omitted from analytics.' });
  }
  normalizeOptionalNumber(normalized, 'targetWeight', value, diagnostics, path, { min: 0, max: 1000 });
  normalizeOptionalNumber(normalized, 'targetReps', value, diagnostics, path, { min: 0, max: 200, integer: true });
  normalizeOptionalNumber(normalized, 'rir', value, diagnostics, path, { min: 0, max: 10 });
  normalizeOptionalNumber(normalized, 'rpe', value, diagnostics, path, { min: 1, max: 10 });
  if (normalized.notes !== undefined && normalized.notes !== null && typeof normalized.notes !== 'string') {
    delete normalized.notes;
    addDiagnostic(diagnostics, { path: `${path}.notes`, code: 'invalid_notes', message: 'Invalid notes omitted from analytics.' });
  }

  const source = { representation, exerciseIdentifier, exerciseLabel, raw: value } satisfies LegacySetSource;
  const existing = sources.get(String(normalized.id)) ?? [];
  existing.push(source);
  sources.set(String(normalized.id), existing);
  return normalized;
}

function prepareLegacyRecord(raw: unknown, index: number, diagnostics: AnalyticsDiagnostic[]): {
  value: RecordValue;
  sources: Map<string, LegacySetSource[]>;
} | undefined {
  if (!isRecord(raw)) {
    addDiagnostic(diagnostics, { severity: 'failure', path: String(index), code: 'malformed_workout', message: 'Workout record must be an object.' });
    return undefined;
  }

  const value: RecordValue = { ...raw };
  const sources = new Map<string, LegacySetSource[]>();

  if (value.completedAt === 0) {
    // Preserve the old numeric truthiness rule at this compatibility seam.
    delete value.completedAt;
    addDiagnostic(diagnostics, { path: 'completedAt', code: 'epoch_completion_compatibility', message: 'Numeric zero completion time omitted to preserve legacy fallback semantics.' });
  }
  if (value.scheduledDate === '') {
    delete value.scheduledDate;
    addDiagnostic(diagnostics, { path: 'scheduledDate', code: 'empty_date_omitted', message: 'Empty scheduled date omitted at the analytics boundary.' });
  }
  if (value.userId !== undefined && (typeof value.userId !== 'string' || !value.userId.trim())) {
    delete value.userId;
    addDiagnostic(diagnostics, { path: 'userId', code: 'empty_owner_omitted', message: 'Empty legacy owner omitted; the read scope supplies context.' });
  }
  if (value.id !== undefined && (typeof value.id !== 'string' || !value.id.trim())) {
    delete value.id;
    addDiagnostic(diagnostics, { path: 'id', code: 'empty_id_omitted', message: 'Empty legacy workout ID omitted; a read-only ID is derived.' });
  }

  if (value.version !== undefined) {
    const version = decimal(value.version);
    if (version === undefined || version < 0 || !Number.isInteger(version)) {
      delete value.version;
      addDiagnostic(diagnostics, { path: 'version', code: 'invalid_version_defaulted', message: 'Invalid legacy version omitted; the adapter uses its read-only version-zero convention.' });
    } else value.version = version;
  }
  for (const key of ['duration', 'volume', 'totalVolume']) {
    if (value[key] === undefined || value[key] === null) continue;
    const measurement = decimal(value[key]);
    if (measurement === undefined || measurement < 0) {
      delete value[key];
      addDiagnostic(diagnostics, { path: key, code: 'invalid_legacy_metric_omitted', message: 'Invalid legacy metric omitted from the canonical analytics projection.' });
    } else value[key] = measurement;
  }

  if (value.exercises !== undefined && value.exercises !== null && !Array.isArray(value.exercises)) {
    // The old extractor ignored a non-array nested mirror and could still use
    // a valid flat array. Keep that useful read behavior at the boundary.
    delete value.exercises;
    addDiagnostic(diagnostics, { path: 'exercises', code: 'malformed_exercises_ignored', message: 'Non-array nested exercises ignored so a valid flat representation can be read.' });
  }
  if (value.sets !== undefined && value.sets !== null && !Array.isArray(value.sets)) {
    // A malformed flat collection is never a valid canonical source. If a
    // nested array exists it may still be used under the explicit precedence
    // rule; otherwise this becomes an empty flat collection.
    if (Array.isArray(value.exercises) && value.exercises.length > 0) delete value.sets;
    else value.sets = [];
    addDiagnostic(diagnostics, { path: 'sets', code: 'malformed_sets_ignored', message: 'Non-array flat sets ignored at the analytics boundary.' });
  }

  const nested = Array.isArray(value.exercises) ? value.exercises : [];
  if (nested.length > 0) {
    const exercises: RecordValue[] = [];
    const usedExerciseIds = new Set<string>();
    for (const [exerciseIndex, rawExercise] of nested.entries()) {
      if (!isRecord(rawExercise) || typeof rawExercise.exerciseId !== 'string' || !rawExercise.exerciseId.trim()) {
        addDiagnostic(diagnostics, { path: `exercises.${exerciseIndex}`, code: 'malformed_exercise', message: 'Malformed nested exercise omitted; flat mirrors are not resurrected.' });
        continue;
      }
      const exercise: RecordValue = { ...rawExercise };
      exercise.id = uniqueIdentifier(rawExercise.id, `legacy-exercise-${exerciseIndex}`, usedExerciseIds, diagnostics, `exercises.${exerciseIndex}.id`);
      if (rawExercise.sets === null || rawExercise.sets === undefined) {
        exercise.sets = [];
        addDiagnostic(diagnostics, { path: `exercises.${exerciseIndex}.sets`, code: 'missing_sets', message: 'Missing nested sets represented as an empty collection.' });
      } else if (!Array.isArray(rawExercise.sets)) {
        addDiagnostic(diagnostics, { severity: 'failure', path: `exercises.${exerciseIndex}.sets`, code: 'malformed_sets', message: 'Nested sets must be an array.' });
        continue;
      } else {
        const usedSetIds = new Set<string>();
        const normalizedSets: RecordValue[] = [];
        for (const [setIndex, rawSet] of rawExercise.sets.entries()) {
          const normalizedSet = normalizeSet(rawSet, setIndex, `exercises.${exerciseIndex}.sets.${setIndex}`, 'nested', rawExercise.exerciseId, usedSetIds, diagnostics, sources, typeof rawExercise.name === 'string' ? rawExercise.name : undefined);
          if (normalizedSet) normalizedSets.push(normalizedSet);
        }
        exercise.sets = normalizedSets;
      }
      exercises.push(exercise);
    }
    if (exercises.length === 0) {
      addDiagnostic(diagnostics, { severity: 'failure', path: 'exercises', code: 'nested_exercises_unusable', message: 'Non-empty nested representation contained no usable exercises.' });
      return undefined;
    }
    // Keep nested precedence explicit. The Phase 1 adapter will issue its own
    // nested_precedence warning when a flat mirror is present.
    value.exercises = exercises;
  } else if (Array.isArray(value.sets)) {
    const normalizedSets: RecordValue[] = [];
    const usedSetIdsByExercise = new Map<string, Set<string>>();
    for (const [setIndex, rawSet] of value.sets.entries()) {
      if (!isRecord(rawSet)) {
        addDiagnostic(diagnostics, { path: `sets.${setIndex}`, code: 'malformed_set', message: 'Malformed set omitted from canonical analytics input.' });
        continue;
      }
      const rawExercise = isRecord(rawSet) && typeof rawSet.exercise === 'string' ? rawSet.exercise : '';
      if (!rawExercise.trim()) {
        addDiagnostic(diagnostics, { path: `sets.${setIndex}.exercise`, code: 'missing_exercise', message: 'Set without an exercise identifier omitted from analytics.' });
        continue;
      }
      const normalizedIdentifier = rawExercise;
      const usedSetIds = usedSetIdsByExercise.get(normalizedIdentifier) ?? new Set<string>();
      usedSetIdsByExercise.set(normalizedIdentifier, usedSetIds);
      const normalizedSet = normalizeSet(rawSet, setIndex, `sets.${setIndex}`, 'flat', normalizedIdentifier, usedSetIds, diagnostics, sources);
      if (normalizedSet) normalizedSets.push(normalizedSet);
    }
    value.sets = normalizedSets;
  } else if (value.sets === null) {
    // The adapter already treats null as an empty flat collection; retain that
    // behavior while making the condition visible to callers.
    addDiagnostic(diagnostics, { path: 'sets', code: 'missing_sets', message: 'Null flat sets represented as an empty collection.' });
  }

  return { value, sources };
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Normalize legacy read records through the Phase 1 adapter for analytics.
 * This function never writes or mutates a source record. It only drops a
 * malformed set/record from the derived read and returns a diagnostic.
 */
export function adaptLegacyWorkoutsForAnalytics(
  records: readonly unknown[],
  options: LegacyAnalyticsAdapterOptions = {}
): LegacyAnalyticsAdapterResult {
  const result: LegacyAnalyticsAdapterResult = {
    sessions: [],
    diagnostics: [],
    failures: [],
    sourcesBySessionId: new Map(),
  };

  if (!Array.isArray(records)) {
    const issue: AdapterIssue = { path: '', code: 'invalid_collection', message: 'Expected an array of workout records.' };
    result.diagnostics.push({ severity: 'failure', code: issue.code, message: issue.message });
    result.failures.push({ index: -1, issues: [issue] });
    return result;
  }

  for (const [index, raw] of records.entries()) {
    const localDiagnostics: AnalyticsDiagnostic[] = [];
    const prepared = prepareLegacyRecord(raw, index, localDiagnostics);
    if (!prepared) {
      result.diagnostics.push(...localDiagnostics);
      result.failures.push({ index, issues: localDiagnostics.map(item => ({ path: item.path ?? '', code: item.code, message: item.message })) });
      continue;
    }

    const rawRecord = prepared.value;
    const owner = options.userId ?? (validIdentifier(rawRecord.userId) ? rawRecord.userId : `legacy-analytics-${index}`);
    const documentId = validIdentifier(rawRecord.id) ? rawRecord.id : `legacy-workout-${index}`;
    if (!validIdentifier(rawRecord.id)) {
      rawRecord.id = documentId;
      localDiagnostics.push({ path: 'id', code: 'derived_id', message: 'Read-only workout ID derived from source position', severity: 'warning' });
    }

    const adapted = adaptLegacyWorkout(rawRecord, { userId: owner, documentId });
    if (!adapted.success) {
      addAdapterIssues(result.diagnostics, adapted.issues, 'failure', documentId);
      result.diagnostics.push(...localDiagnostics);
      result.failures.push({ index, issues: adapted.issues });
      continue;
    }

    result.sessions.push(adapted.data);
    addAdapterIssues(result.diagnostics, adapted.issues, 'warning', adapted.data.id);
    result.diagnostics.push(...localDiagnostics.map(item => ({ ...item, sessionId: adapted.data.id })));
    result.sourcesBySessionId.set(adapted.data.id, prepared.sources);
  }
  return result;
}
