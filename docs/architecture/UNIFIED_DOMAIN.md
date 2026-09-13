# Unified domain foundation

## Current application and boundaries

FORGE is a React 19/Vite application with Zustand state, Firebase Auth/Firestore reads and an Express server (`package.json`, `src/App.tsx`, `src/store/`, `server.ts`). The local exercise catalog is `src/lib/exercises.ts`. Existing persisted contracts remain in `src/types.ts`; UI exercise metadata also exists in `src/types/workout.ts`. None of these types or dependencies is removed.

`src/domain/canonical/` is an additive, browser-safe internal model. Each exported type is inferred from its Zod schema. Objects reject extra fields; finite numbers, units, date formats, versions and relevant ranges are explicit. `tsconfig.domain.json` enables strict mode and unchecked-index checking without imposing a broad strictness refactor on legacy code.

| Module | Contract | Current source / implementation limit |
| --- | --- | --- |
| `user.ts` | User, Profile, Preferences | Firebase uid and `users` profile. Preferences cover existing onboarding fields; credentials and autonomy permissions are excluded. |
| `exercise.ts` | Exercise, ExerciseReference | Existing catalog IDs retained. Exact normalized IDs/names resolve; partial/custom names remain explicit unresolved references, not invented catalog entries. |
| `training.ts` | SetPerformance, ExercisePerformance, TrainingSession | Read projection of legacy Workout. Weight in kg; target and achieved values are separate; completion may be unknown. Session version is the original OCC version, independent of schemaVersion. |
| `program.ts` | Plan, Program, PlanDay, PlannedExercise | Existing TrainingPlan days/rep ranges. Program is an alias for this same contract; no new cycle/scheduling engine. |
| `health.ts` | HealthObservation | Bodyweight observations in kg only, with time and provenance. Other health metrics require future unit-specific schema variants. |
| `intelligence.ts` | Observation, Trend, Recommendation, Decision, Outcome | Structural evidence/time/identity contracts only. No collection, automatic persistence, scoring engine or execution authority. |
| `common.ts` | IDs, dates, provenance, references | Domain IDs are not validated Firestore paths or authorization grants. Service boundaries retain their own checks. |

## Compatibility policy

Adapters in `canonical/adapters/` accept `unknown`, validate known legacy fields, strip unrelated fields from the projection and validate their canonical output. They return success/data/issues or failure/issues. They never mutate, serialize over, or write back the input. Original documents retain presentation fields, unknown extensions and legacy formats; the canonical projection is intentionally not a lossless replacement document.

`adaptLegacyWorkout` selects nonempty nested exercises over the flat mirror, matching `candidateWorkout` in `src/server/proposals.ts`. It does not merge mirrored sets. Empty nested arrays use flat sets. Contiguous flat A/B/A blocks remain ordered and separate. Nested IDs/targets/notes and set ordering are retained. Missing IDs get deterministic read-only position IDs with diagnostics; duplicate IDs within a performance/plan fail validation. These IDs must never be used to construct a mutation against the original document.

Upper/lowercase legacy statuses normalize to uppercase. Missing completion becomes `unknown`, not a guessed boolean. Legacy `normal` and absent setType map to `N`. Zero weight and zero-rep drafts remain representable. Decimal numeric strings are accepted only by legacy set/measurement adapters; canonical values remain strictly numeric. Unsupported/malformed values fail visibly rather than producing NaN or guessed measurements.

Calendar dates stay `YYYY-MM-DD`. Numeric epoch milliseconds and explicit ISO instants normalize to UTC; date-only legacy metadata means midnight UTC. Missing dates remain absent. Firestore Timestamp objects are not currently a proven persisted contract for these fields and are not accepted by these adapters. A provider/SDK adapter must explicitly decode them if introduced. Legacy duration remains under `legacy.duration` with a warning because existing writers disagree on units (`ActiveWorkout.tsx`, `server.ts`). No canonical duration is inferred.

Missing OCC version maps to zero with a diagnostic, following the server's existing missing-version convention. This is a read decision only; existing workout write preconditions are unchanged. Missing userId can only be supplied from explicit authorized read scope and is reported; a stored owner/document-ID mismatch fails. Scope supplied by a caller is never authentication.

`getCanonicalTrainingSessions` in `src/lib/api.ts` is the opt-in application seam. Its `sessions`, `failures` and `warnings` keep malformed records visible to adopting callers (index -1 denotes a malformed collection). Existing `getWorkouts`, local fallback, UI consumers and mutation APIs keep their contracts. Phase 2 analytics additionally exposes opt-in diagnostics through its compatibility wrappers.

## Canonical analytics adoption (Phase 2)

`src/domain/analytics/` now contains the pure history and progression
computations. They accept only `TrainingSession`/`SetPerformance`-derived
inputs and never access Firebase, mutate records, call AI or write a proposal.
`src/domain/analytics/legacyAdapter.ts` is the read-only compatibility seam for
legacy callers: it sanitizes malformed set entries with diagnostics, invokes
the Phase 1 `adaptLegacyWorkout`, and retains presentation-only source data for
the old output formatter. `src/lib/progression.ts` keeps the existing public
functions and DTOs as thin wrappers over that path.

Canonical analytics includes only completed sessions; `unknown` completion is
historically usable and explicit `not_completed` sets are excluded. Nested
nonempty exercise data is authoritative over flat mirrors. Exercise selection
uses canonical IDs, exact catalog names and a small explicit alias table;
ambiguous partial names produce a diagnostic and no selection, while unknown
custom identifiers remain unresolved and exact-matchable. These choices are
intentional, tested divergences from the old bidirectional-substring matcher
and are recorded in the phase plan. The Epley/RIR policy, volume calculation,
ordering and progression thresholds remain unchanged for unambiguous valid
records.

## Boundaries deliberately preserved

- There is no single universal secure mutation function today: the generic envelope pipeline, workout routes, plan service and reviewed proposal service implement different supported operations. Consolidating them is outside this phase.
- `firestore.rules` forbids direct client writes to workouts, plans, proposals, permissions and audit logs. Profiles, bodyweight, personal records and targets retain their existing distinct owner-scoped policies; this document does not claim all writes already use the same pipeline.
- `Decision.choice = accepted` records intent only. It cannot execute a proposal or prove authorization. Future services must verify same-user links, actual proposal state and committed audit records; shape validation cannot establish those facts.
- Legacy analytics entry points remain available for callers, but their
  exercise-history and progression work now runs through the canonical
  analytics path. Other deterministic consumers (`hypertrophy`, readiness,
  deload, recap and progression rules) still own their existing legacy input
  semantics until a later migration.

See `../plans/UNIFIED_FITNESS_CORE.md` for staged acceptance and rollback.
