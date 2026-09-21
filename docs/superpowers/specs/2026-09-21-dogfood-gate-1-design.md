# Dogfood Gate 1 — Trustworthy Gym Session Design

**Status:** Proposed design approved in chat on 2026-09-21  
**Repository baseline:** `825da5ad2dd27c0b7e3021ec59a61dd003ba050d`  
**Scope owner:** FORGE core workout loop only

## 1. Goal

Make one real gym session trustworthy end to end.

A user must be able to start a workout, log sets, leave or reload the app, recover the active session, continue logging, finish once, and then see history and basic analytics that match exactly what was completed.

The release gate is not “the app looks finished.” The release gate is: **one normal gym session can be trusted without the user worrying about phantom sets, lost progress, duplicate writes, stale versions, or mismatched history.**

## 2. Success criteria

Dogfood Gate 1 passes only when all of the following are true:

1. Set completion is explicit. Entering a weight or rep value never marks a set complete.
2. Exercise and set identity stay stable through normalization, autosync, conflict handling, retries, reloads, and finish.
3. There is one durable local source of truth for the active workout.
4. Reload/app restart restores the in-progress workout without silently losing or inventing state.
5. Exactly one autosync lifecycle exists per active workout.
6. Repeated delivery of the same logical sync/finish mutation is idempotent.
7. OCC conflicts never silently overwrite newer server state.
8. Workout finish saves only completed working sets and produces one authoritative completed workout.
9. History matches the authoritative completed workout exactly.
10. Basic deterministic analytics consume the same canonical completed-set truth as history.

## 3. Non-goals

This gate does **not** include:

- new Brain features
- naming work
- redesigning Home again
- visual polish outside changes required for correctness or status/error clarity
- new workout templates
- advanced analytics
- recommendation tuning
- progression-model redesign
- deployment expansion beyond what is required to validate the core session path
- refactoring unrelated code

The current Home design direction is frozen for this gate.

## 4. Locked FORGE invariants

All work must preserve:

- server-authoritative mutations
- authenticated user identity
- Firestore client-write restrictions
- OCC/version checks
- idempotency protection
- audit logs
- rollback semantics
- stable canonical exercise identity
- deterministic analytics
- local-first active-session behavior
- existing security regression coverage

No fix may bypass these invariants for convenience.

## 5. Verified current state at baseline

### 5.1 Explicit set completion — improved

`src/components/workout/ActiveWorkout.tsx` completes a set only through `handleCompleteSet(...)`, which toggles `completed` explicitly.

The finish path filters each exercise to:

```ts
const completedSets = ex.sets.filter(s => s.completed);
```

This is the correct direction: unfinished sets are not promoted merely because weight/reps are non-zero.

**Gate status:** partially satisfied; must remain covered by regression tests through finish/history.

### 5.2 Deterministic fallback identity — improved

`src/lib/validation.ts` now uses deterministic fallback IDs:

- flat sets: `s_<index>`
- nested exercises: `ex_<index>`
- nested sets: `s_<exerciseIndex>_<setIndex>`

This removes prior random fallback IDs during validation.

**Gate status:** partially satisfied. Identity still must be proven stable across all client/server transitions, not only validation.

### 5.3 Durable local active workout — present

`src/store/useWorkoutStore.ts` uses Zustand `persist` with storage key:

```
forge-active-workout-v2
```

Persisted state includes:

- `activeWorkout`
- `startedAt`
- `restEndTime`
- `lastSyncedAt`

`isModalOpen` is intentionally not persisted.

**Gate status:** partially satisfied. Recovery must be tested against reload and stale/partial state.

### 5.4 Autosync lifecycle — improved

`src/components/workout/ActiveWorkoutBottomBar.tsx` keeps the current workout/user/elapsed state in refs and creates the 45-second sync interval with dependencies on stable primitives such as `activeWorkout?.id` and `user?.uid`.

This avoids recreating the timer on ordinary set edits.

**Gate status:** partially satisfied. Retry behavior and stale-version behavior still need hardening.

### 5.5 Remote delete failure isolation — improved

`src/pages/Workout.tsx` waits for remote deletion before clearing an active local draft.

**Gate status:** outside the primary finish flow, but current behavior should remain regression-protected.

### 5.6 Idempotency gap — confirmed

`src/lib/api.ts` currently generates a new mutation ID inside every `mutateWorkout(...)` call:

```ts
mutationId: crypto.randomUUID()
```

That means a transport retry of the same logical mutation naturally receives a different idempotency key unless the caller owns and reuses one.

OCC reduces some duplicate-write risk, but OCC is not equivalent to exactly-once logical delivery.

**Gate status:** confirmed blocker.

### 5.7 Finish-authority gap — confirmed

`src/components/workout/ActiveWorkout.tsx` constructs `completedWorkout` locally, then calls `mutateWorkout(...)`.

After the request succeeds, it calls:

```ts
finishWorkout();
onWorkoutFinished?.(completedWorkout);
```

The UI handoff therefore uses the locally constructed object rather than necessarily using the authoritative workout returned by the server mutation.

If the server normalizes, versions, rejects fields, or otherwise returns a different canonical state, the post-finish UI/history path can diverge from the authoritative record.

**Gate status:** confirmed blocker.

## 6. Required design

### 6.1 Active-session truth

The active workout store is the single local source of truth while a session is in progress.

UI components may derive views from it, but must not maintain competing copies of mutable session state.

Server responses may replace/merge the active store only through one explicit reconciliation path.

### 6.2 Stable IDs

IDs must be created once, then preserved.

Rules:

- existing exercise/set IDs must never be regenerated during normalization
- client-created exercises/sets may use `crypto.randomUUID()` once at creation time
- validation may provide deterministic fallback IDs only for legacy/malformed inputs that lack IDs
- retries must not create new domain IDs
- server responses must preserve IDs or reject the mutation

Canonical exercise identity remains based on the existing exercise registry/canonical exercise ID rules.

### 6.3 Sync operation identity

Each logical write operation must own a stable operation ID before network delivery.

A sync attempt and any transport retry of that same sync must reuse the same idempotency key.

A later sync representing newer local state receives a new key.

The caller—not `mutateWorkout()`—must define logical mutation identity.

Recommended interface shape:

```ts
mutateWorkout(
  workoutId,
  baseVersion,
  updates,
  {
    mutationId,
    duration,
    volume
  }
)
```

Equivalent typed shapes are acceptable, but the key requirement is that `mutationId` is supplied by the logical operation owner and can be reused.

### 6.4 Autosync state machine

For one active workout:

1. At most one periodic autosync timer exists.
2. A tick snapshots the current local state.
3. The tick creates one logical mutation ID.
4. Network delivery uses that ID.
5. A transport retry reuses that ID.
6. A successful server response updates the local version/state.
7. A 409/OCC conflict does not overwrite local or server state blindly.
8. Another periodic write must not race the unresolved write for the same workout.

The simplest acceptable implementation is a single in-flight autosync guard with one pending-dirty follow-up sync.

A queueing framework is unnecessary for this gate.

### 6.5 OCC conflict behavior

When the server reports a stale version:

- do not silently retry against the new version using stale updates
- keep the local draft intact
- retain the authoritative server snapshot from the error response when available
- surface a recoverable conflict state
- allow deterministic reconciliation or a user-visible retry path

For Dogfood Gate 1, correctness beats automatic merging.

If automatic reconciliation cannot be proven safe, preserve both states and require an explicit recovery action.

### 6.6 Finish semantics

Finish is a single logical mutation.

Before sending:

- include only explicitly completed sets
- omit incomplete exercises with zero completed sets
- compute total volume from those same completed sets
- preserve stable exercise/set IDs
- use the active workout’s current base version
- assign one finish mutation ID and reuse it for retries

The finish response from the server is authoritative.

After success:

1. capture the returned authoritative completed workout
2. update any local workout/history cache with that returned object
3. clear the active-workout store only after authoritative success
4. pass the returned authoritative object to post-workout summary/UI
5. never reconstruct a second competing completion object after success

If the server returns NOT_FOUND and legacy creation fallback remains necessary, that fallback must also be idempotent and must return the authoritative saved workout before local clear/handoff.

### 6.7 History truth

History must render from the saved authoritative workout.

For one finished session, history must match:

- workout ID
- version
- completion timestamp
- exercise IDs
- set IDs
- weight
- reps
- RIR/RPE where present
- completion flags
- total volume

No history adapter may infer extra completed sets from target values or non-zero inputs.

### 6.8 Basic analytics truth

Basic analytics for this gate include only deterministic metrics already supported by the app, such as completed-set volume and e1RM/progression calculations.

Analytics must consume canonical completed working sets once.

If a workout contains both nested `exercises[].sets` and legacy flat `sets`, adapters must avoid double counting.

Warmups or other excluded set types must not enter working-set metrics unless current product rules explicitly include them.

## 7. Error handling

### Local persistence failure

If browser persistence fails, the app should keep the in-memory session alive and surface a warning rather than pretending recovery is guaranteed.

### Autosync network failure

Keep the local draft. Do not clear or downgrade the workout. Mark sync as pending/failed and retry later with correct operation identity.

### OCC conflict

Preserve local draft and server snapshot. Do not auto-overwrite either side.

### Finish network failure

Do not clear the active workout. The user must be able to retry finish without duplicating the logical completion.

### Finish succeeds but UI transition fails

The authoritative completed workout must remain available in local cache/history so reopening the app shows the completed session rather than resurrecting it as active.

## 8. Test strategy

Implementation must be test-first where practical.

### 8.1 Unit/regression tests

Add or extend tests for:

- explicit completion only
- no phantom sets on finish
- deterministic validation fallback IDs
- stable IDs across normalization and retry
- active-workout persisted-state round trip
- one autosync timer across ordinary edits
- latest state read by autosync
- same logical retry reuses mutation ID
- next logical sync gets a new mutation ID
- OCC 409 does not silently overwrite
- finish failure preserves active draft
- finish retry is idempotent
- authoritative finish response is used for post-finish handoff
- history exactly matches authoritative response
- dual representation does not double-count analytics
- incomplete and excluded sets do not enter completed working-set analytics

### 8.2 Integration test

One deterministic end-to-end test should simulate:

1. start planned workout
2. complete some sets, leave others incomplete
3. persist state
4. reload/re-hydrate
5. edit another set
6. autosync
7. simulate a retry
8. finish
9. read history
10. run basic analytics

Assertions must prove the same canonical completed-set set flows through finish, history, and analytics.

### 8.3 Manual dogfood script

A real-device dogfood pass is required before the gate is closed:

1. Start a workout on the phone.
2. Log at least two exercises.
3. Complete some sets and leave at least one typed but incomplete set.
4. Background the app.
5. Reload/reopen.
6. Confirm exact recovery.
7. Continue logging.
8. Let at least one autosync occur.
9. Finish the workout.
10. Reopen history.
11. Compare every set against what was logged.
12. Confirm basic analytics reflect completed sets only.

## 9. Likely affected files

Primary:

- `src/lib/api.ts`
- `src/store/useWorkoutStore.ts`
- `src/components/workout/ActiveWorkout.tsx`
- `src/components/workout/ActiveWorkoutBottomBar.tsx`
- server workout mutation handlers in `server.ts`
- idempotency/OCC helpers under `src/lib/` and `src/domain/`

Tests:

- `tests/phase2_reliability_regression.test.ts`
- `tests/mutations.test.ts`
- `tests/security_and_loop.test.ts`
- new focused Dogfood Gate 1 integration/regression test if existing suites become too broad

Secondary only if required by authoritative handoff:

- `src/pages/Workout.tsx`
- post-workout summary components
- analytics adapters consuming completed workout data

## 10. Exit criteria

Dogfood Gate 1 is complete only when:

- all targeted regression/integration tests pass locally
- existing security and mutation regressions still pass
- build/typecheck pass
- one real phone session passes the manual dogfood script
- no duplicate workout or duplicate-set history appears
- no incomplete set appears as completed
- reload restores the active session exactly
- finish failure leaves the session recoverable
- a successful finish clears the active session only after authoritative save
- history and basic analytics agree on the same completed sets

Only after this gate passes should FORGE resume broad UI propagation, Brain expansion, or production deployment work.
