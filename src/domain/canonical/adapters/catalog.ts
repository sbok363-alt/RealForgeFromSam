import { EXERCISE_DATABASE } from '../../../lib/exercises';
import { ExerciseSchema, type ExerciseReference } from '../exercise';
import { IdSchema } from '../common';
import { adapt } from './shared';

// Strip presentation-only catalog fields at this boundary; retain the source catalog.
const CatalogInputSchema = ExerciseSchema.omit({ schemaVersion: true }).strip();
export function adaptCatalogExercise(raw: unknown) {
  return adapt(() => ExerciseSchema.parse({ ...CatalogInputSchema.parse(raw), schemaVersion: 1 }));
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[-_\s]+/g, '_');
export function resolveExercise(identifier: string, label = identifier): ExerciseReference {
  IdSchema.parse(identifier); IdSchema.parse(label);
  const normalized = normalize(identifier);
  const matches = EXERCISE_DATABASE.filter(entry => normalize(entry.id) === normalized || normalize(entry.name) === normalized);
  const match = matches.length === 1 ? matches[0] : undefined;
  return match
    ? { kind: 'catalog', exerciseId: match.id, label }
    : { kind: 'unresolved', legacyIdentifier: identifier, label };
}
