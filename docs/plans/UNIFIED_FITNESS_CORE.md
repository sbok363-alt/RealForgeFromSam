# Unified fitness core: Phase 0 + Phase 1 + Phase 2

## Contract and scope

Read `.astra/INDEX.md`. The current working tree, including existing uncommitted security fixes, is authoritative. Phase 0/1 established an additive, read-only canonical foundation; Phase 2 adopts it for exercise-history and progression reads while retaining all legacy types, persistence formats, APIs and security behavior. No deployment, destructive migration, new service, UI redesign or Phase 3 implementation.

## Investigation (2026-09-13, before implementation)

| Surface | Current evidence and migration seam |
| --- | --- |
| Domain | `src/types.ts`: Workout has flat sets AND optional nested exercises, mixed-case statuses, optional owner, OCC version; profile, bodyweight and plan types already exist. `src/types/workout.ts` duplicates exercise definitions. |
| Persistence | `src/lib/api.ts`: Firestore SDK reads with several localStorage fallbacks; casts rather than a shared read schema. Workout/plan/proposal writes use HTTP. Profiles/bodyweight/records/targets retain owner-scoped SDK writes. `src/lib/firestore-rest.ts` serves server-side AI read tools. |
| Exercise identity | `src/lib/exercises.ts`: local catalog, exact/id lookup and a separate fuzzy name lookup. Unknown custom names exist; never merge them through fuzzy guesses. |
| Analytics | `src/lib/progression.ts`, `hypertrophy.ts`, `readiness.ts`, `deload.ts`, `weeklyRecap.ts`, `progressionRules.ts`, `sessionCompare.ts`, `src/domain/analytics.ts`: deterministic consumers. Phase 2 moved history/progression computation to `src/domain/analytics/`; the other helpers still consume legacy Workout views. |
| AI | `server.ts`, `src/lib/server-tools.ts`, `src/ai/progressBrain.ts`: BYOK gate, bounded tool loop, deterministic context, reviewed workout proposals. `executeBrainAction` now returns analysis only despite older comments claiming mutation. |
| Mutations | `server.ts`, `src/domain/mutations.ts`, `src/server/{security,plans,proposals,secured-routes}.ts`, `src/server/mutations/firestore-adapter.ts`: several authoritative transaction paths, not one universal function. Preserve each path's ownership, validation, replay, OCC, permission epoch, audit and rollback checks. |
| Rules | `firestore.rules`: workouts/plans/proposals/permissions/audits deny direct writes; replay records deny reads and writes. Other owner-scoped collections have different policies. Preserve actual rules over stale comments. |
| Verification | `npm run lint` is `tsc --noEmit` (project is not globally strict). `npm test` runs five security suites; additional regression scripts and `firebase.emulator.json` exist. Some older suites use non-fatal `console.assert`. No checked-in CI workflow found. |

## Risks and compatibility decisions

- Nested exercises are authoritative for the canonical analytics read model when nonempty, matching proposal validation. Flat mirrors must not double count. This resolves the old extractor's flat-first fallback and is covered by a compatibility divergence test.
- Missing completion becomes `unknown`; neither completed nor uncompleted is invented. Zero-load/bodyweight sets and zero-rep drafts must remain representable.
- Existing numeric milliseconds and server ISO timestamps need explicit normalization. Calendar dates stay dates. `duration` is ambiguous: ActiveWorkout stores seconds, while CREATE_WORKOUT_SESSION stores durationMinutes in it. Preserve it as legacy metadata, never guess units.
- Missing document versions map to the existing version-zero convention, with diagnostics. Canonical schema version is separate from OCC version. Never write normalized values back.
- Unknown exercise identifiers remain unresolved references. Canonical analytics uses exact IDs/names plus a small explicit alias table; broad substring matches and ambiguous partial names are diagnosed rather than guessed.
- New canonical reads report per-record failures without changing `getWorkouts` or dropping stored data. Scope supplied by a caller is context, not authorization; it must originate from an already authorized read. Mismatched owner is an error.
- Profile preferences are not autonomy permissions. Intelligence records are evidence and links, never authority or executable mutation payloads.
- Add a strict TypeScript compilation boundary for the new modules instead of forcing an unrelated application-wide strict migration.
- Legacy analytics wrappers expose opt-in diagnostics while preserving their existing return DTOs. Malformed set entries are dropped from the derived read with a path/code diagnostic; persisted records are never rewritten.

## Ordered implementation and acceptance

1. **Phase 0 harness:** add root AGENTS.md, these verified architecture maps and this plan. Acceptance: future-agent entrypoint and runnable verification commands reference current code.
2. **Phase 1 schemas:** browser-safe, modular Zod schemas and inferred strict TS types for user/profile/preferences, exercise, set/exercise performance, session, program/plan, health, observation/trend/recommendation/decision/outcome. Acceptance: unknown fields and invalid numeric/date/range data rejected; no authorization claims in these records.
3. **Phase 1 adapters:** pure unknown-input adapters for legacy workouts, profile, catalog, plan and bodyweight; one additive application read seam for canonical training sessions. Acceptance: flat/nested/mirrored data, aliases, targets, timestamps, absent fields and malformed records have tested explicit outcomes; original inputs remain unchanged; no new writes.
4. **Phase 1 verification:** focused schema/adapter tests, strict typecheck, existing typecheck and regression scripts, emulator suite where available, production build, final diff/security-file preservation review. Acceptance: report actual exits and limitations; passing prose printed by a test is insufficient evidence.
5. **Phase 2 characterization:** freeze pre-refactor history/progression and Brain outputs, inspect every caller, and add fixtures for flat/nested/mirrored records, completion, identity, dates, RIR/RPE, malformed sets and all progression states. Acceptance: baseline fixtures are captured before the computation moves.
6. **Phase 2 canonical adoption:** adapt legacy reads through `adaptLegacyWorkout`, compute one pure canonical history/progression path, retain compatibility wrappers and surface diagnostics. Acceptance: canonical and legacy paths match for unambiguous valid data; intentional identity/representation/malformed-data divergences are explicit and tested; no persistence or mutation path changes.
7. **Phase 2 verification:** run application and strict-domain typechecks, original and canonical/Phase 2 tests, all regression suites, Firebase emulator/security checks and production build where the environment permits. Acceptance: record exact exits, unchanged rules/schema evidence and any environment limitation; do not call an unavailable check passing.

## Phase 2 characterization (pre-refactor, 2026-09-13)

The first Phase 2 change is a characterization suite, run against the existing
`src/lib/progression.ts` implementation before it is moved. The suite is
`tests/phase2_characterization.test.ts`, with realistic fixtures in
`tests/fixtures/phase2_workouts.ts` and frozen outputs in
`tests/fixtures/phase2_legacy_golden.json` and
`tests/fixtures/phase2_brain_golden.json`.

The audit found these current contracts:

| Concern | Existing behavior captured by the baseline |
| --- | --- |
| Session status | Only `COMPLETED` and lowercase `completed` are included; other status values are excluded. |
| Set completion | `completed: false`, `null`, `0`, and `''` are excluded. A missing flag is included. Other truthy malformed values are included. |
| Representation | Matching flat sets are used when any exist. If no flat set matches, nested exercise sets are used. Nested output drops `setType` and target fields. |
| Exercise matching | Lowercase, remove hyphens/underscores/whitespace, then exact-or-bidirectional-substring matching. Empty query/name matches everything. |
| Measurements | Invalid/non-positive weight or reps remain in `sets` and `setsCount`, but do not add volume or e1RM. Warm-ups are included in both. |
| RIR/RPE | e1RM uses numeric RIR clamped to 0..5; numeric-string RIR is ignored by the old formula. RPE is metadata only. Equal e1RM keeps the first set. The canonical boundary intentionally parses safe decimal optional values, reports that normalization, and represents the result as a number before canonical analytics. |
| Dates/order | `scheduledDate` labels a session; `completedAt` (or scheduled-date midnight) orders it ascending; equal timestamps preserve input order. |
| Empty/partial data | Sessions with no positive e1RM are omitted. Missing optional metadata is tolerated; a `null` sets collection currently throws. |
| Progression policy | Insufficient-data, progressing, stalling and regression branches, load increments, e1RM formula, target rules, rationale text and report shape are frozen in the golden report. |

All direct callers were inspected: `src/domain/analytics.ts`,
`src/ai/progressBrain.ts`, `src/lib/server-tools.ts`, `sessionCompare.ts`,
`progressionRules.ts`, `weeklyRecap.ts`, `deload.ts`, and the related progress
and workout UI consumers. They rely on the existing report/history fields and
will keep their public entry points during the migration.

The canonical adoption will use one pure computation path over
`TrainingSession -> ExercisePerformance -> SetPerformance`. Legacy public
functions will remain thin compatibility wrappers that call the Phase 1
workout adapter at the read boundary. No persisted schema, mutation path,
security rule, AI provider, or progression policy is changed.

Before implementation, the following possible divergences are explicitly
tracked for tests and documentation: replacing broad substring/empty-query
matching with exact IDs and a small explicit alias table; reporting ambiguous
aliases instead of selecting arbitrarily; treating nested non-empty data as
authoritative; rejecting or diagnosing malformed completion/numeric/date
values at the adapter boundary; and preserving unresolved custom exercises as
diagnosed unknown references. A divergence is accepted only when a parity test
proves the old result and a companion test records the new intentional rule.

## Phase 2 implementation summary (2026-09-13)

`src/domain/analytics/history.ts` is the canonical history implementation and
`src/domain/analytics/progression.ts` contains the unchanged deterministic
progression policy. Both operate on canonical values only. `math.ts` owns the
unchanged Epley/RIR calculation, while `identity.ts` owns normalization,
explicit aliases and ambiguity diagnostics. `legacyAdapter.ts` invokes the
Phase 1 Zod adapter after a read-only, per-set sanitation pass so one malformed
set does not poison otherwise useful history. No normalized value is written
back.

`src/lib/progression.ts` now contains compatibility DTO formatting and the
legacy entry points. `extractExerciseHistoryWithDiagnostics` and
`analyzeExerciseProgressionWithDiagnostics` provide opt-in diagnostic results;
the original functions keep their old signatures and return shapes. Existing
Brain, server-tool, comparison, recap, deload and UI callers therefore retain
their contracts while reaching the canonical computation through the wrapper.

The canonical completion rule is: a `COMPLETED` session is eligible;
`not_completed` sets are excluded; `unknown` completion is retained because a
missing legacy flag was historically included. Nonempty nested exercises win
over flat mirrors. Identity is exact canonical ID/name, then an explicit alias;
`Press`, `Bench` and `Row` are ambiguous and produce a failure diagnostic;
unknown/custom identifiers are retained as unresolved exact references. The
old substring matcher, empty-name matching, flat-first mirror fallback,
malformed-set throw and invalid-measurement counting are frozen in the legacy
golden and intentionally diverge at the canonical boundary. RIR remains
clamped to 0..5 for e1RM, RPE remains metadata, warm-ups remain included and
chronological ordering is stable. Safe decimal strings at the legacy boundary
are normalized to strict canonical numbers; this changes the old treatment of
numeric-string RIR/RPE (which was not numeric in the old e1RM/metadata path)
and is covered by the adapter diagnostics policy.

Phase 2 test inventory:

- `tests/phase2_characterization.test.ts` freezes the pre-refactor history and
  report outputs plus status, completion, matching, mirror, malformed,
  measurement, RIR/RPE, ordering and duplicate behavior.
- `tests/phase2_canonical_analytics.test.ts` covers legacy-to-canonical
  adaptation, direct canonical input, parity, flat/nested sessions, completion,
  aliases, unknown and ambiguous identity, ordering, e1RM, volume, progression
  state/target and diagnostic immutability.
- `tests/fixtures/phase2_workouts.ts`,
  `phase2_legacy_golden.json` and `phase2_brain_golden.json` are realistic,
  pre-refactor fixtures. They are read-only test evidence, not persisted data.

## Deferred phases

- **Phase 3:** establish an Exercise Registry V2 with canonical identity/substitution infrastructure, explicit alias governance and migration telemetry based on the Phase 2 ambiguity diagnostics. Keep unresolved custom references visible and make provider/application mappings use the registry before adding new trend or recommendation producers.
- **Phase 4:** deterministic observation/trend production and measured recommendation/outcome lifecycle, with provenance and owner/link checks at service boundaries. Only then connect optional AI reasoning to existing reviewed proposals.
- **Later:** richer programs, provider adapters and health ingestion; nutrition/social only after separate requirements, privacy/authorization design and acceptance criteria. No collections or provider integrations are provisioned in this task.

## Rollout and rollback

Deploy nothing in this task. Adopt the new read seam consumer by consumer after comparing old and new results. Keep original documents as the durable source; no backfill or dual write. Rollback is removing a consumer's opt-in canonical read, without restoring data. Legacy types may be removed only after adapter/consumer tests and repository-wide reference checks demonstrate they are unused.

## Verification record

Baseline: existing `npm run lint` and the five `npm test` suites passed. Initial sandbox runs exposed a missing OS user lookup and Firebase configstore access; the test-only assertion preload and workspace Firebase config keep those harness workarounds explicit.

Verification exposed two existing harness/API issues that must be resolved before acceptance:

- The installed firebase-tools 15.30 CLI skips rule loading for the existing multi-database emulator config. `tests/emulator.test.ts` now explicitly installs and reads back the unchanged repository rules for both local databases before assertions. A default test admin app also matches the server's existing initialization contract. No production config/rules changed. [Firebase documents that implicitly created named emulator databases have open rules](https://firebase.google.com/docs/emulator-suite/connect_firestore).
- With rules active, the existing HTTP test exposed malformed tokens returning 503 instead of its expected 401. A narrow `verifyToken` correction maps known Firebase credential rejection codes to a sanitized 401, preserving infrastructure failures and successful identity verification. A focused regression suite covers both paths; ownership, proposal, mutation, OCC, audit and rollback logic is unchanged.

## Phase 0-1 change inventory

- Added `AGENTS.md` and `docs/architecture/{UNIFIED_DOMAIN,DATA_FLOW,BRAIN_LOOP}.md`, plus this plan.
- Added `src/domain/canonical/{common,user,exercise,training,program,health,intelligence,index}.ts` and `adapters/{shared,catalog,workout,records,index}.ts`.
- Added `tsconfig.domain.json`, `tests/canonical_schemas.test.ts`, `tests/canonical_adapters.test.ts`, `tests/auth_error_classification.test.ts`, `tests/assertions.cjs`, and `tests/run-regressions.mjs`.
- Extended `src/lib/api.ts` with one opt-in read/import and `package.json` with strict typecheck, domain, full regression and emulator scripts. No dependencies or lockfiles changed by this phase.
- Corrected known credential error classification in `server.ts`; made `tests/adversarial.test.ts` fail on detected/caught failures and made existing `tests/emulator.test.ts` explicitly install/verify rules and initialize the default test admin app.
- Existing uncommitted files and security work were preserved. This inventory describes this phase's changes, not the entire pre-existing working-tree diff. `firestore.rules`, production configuration, mutation/proposal/OCC/rollback logic, legacy types and UI were not edited.

## Exact recommended Phase 3 task (deferred)

Implement Exercise Registry V2 and substitution infrastructure. Start with an
explicit registry/alias governance contract and a read-only resolver that
consumes the Phase 2 `unknown_exercise_identity` and
`ambiguous_exercise_identity` diagnostics. Add canonical exercise IDs and
substitution links behind adapters, migrate callers one at a time with parity
fixtures, and retain unresolved custom references. Do not backfill or rewrite
Firestore documents until registry coverage, ownership checks and rollback
behavior are proven. Keep trend/recommendation persistence, provider
integrations, nutrition/social modules and AI policy changes out of that task.

## Final verification (2026-09-13)

| Check | Fresh result |
| --- | --- |
| `npm run lint` | PASS, exit 0, application/server TypeScript check |
| `npm run typecheck:domain` | PASS, exit 0, strict canonical modules and tests |
| `npm test` | PASS, exit 0, all five original security regression scripts |
| `npm run test:domain` | PASS, exit 0, 5 schema + 11 adapter + 9 characterization + 12 canonical analytics tests (37 total) |
| `npm run test:regression` | PASS, exit 0, 19/19 non-emulator suites, including the Phase 2 suites; console.assert failures are fatal |
| `npm run test:emulator` | PASS, exit 0, exact rules read-back, named-database ownership/direct-write denials, real token verification, OCC contention, replay/atomicity and approval race. The command used a workspace `XDG_CONFIG_HOME` because the sandbox blocks the default Firebase configstore path. |
| `npm run build` | PASS, exit 0, Vite client bundle plus server bundle. Rollup reported the existing Zod annotation and large-chunk warnings. |
| `git diff --check` | PASS, exit 0 under the repository's normal line-ending configuration |

The regression assertion preload was independently probed with an intentional false assertion: it throws ERR_ASSERTION as intended. The adversarial suite now exits nonzero on detected failures instead of merely printing a count.

Acceptance mapping: Phase 0/1 harness and maps remain confirmed; canonical entity coverage/strict boundaries remain confirmed; Phase 2 legacy loading/diagnostics/no input mutation and canonical history/progression parity are confirmed by the focused suites; preserved security behavior is confirmed by the original regressions and emulator denials/races. No Firestore document, rule, mutation, proposal, AI provider or UI path was changed by Phase 2.

Build warnings remain for Zod dependency comment annotations and the large client chunk (about 2.1 MB minified / 605 KB gzip). The CLI still prints its multi-database rule-loading warning, but the test explicitly installs and verifies both rulesets before use. Local emulator processes required cleanup on this Windows host after CLI shutdown. These are local verification details, not production rule changes.

No live data migration, deployment, provider call or paid API was performed. Live production records and browser workflows were not newly exercised; existing UI paths remain unchanged. Canonical readers must handle diagnostics when adopted. Exercise Registry V2, additional health metrics, richer programs and the persistent intelligence loop remain deferred.
