# Dogfood Gate 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make one real FORGE gym session trustworthy from start through reload/retry/finish/history/analytics, with explicit completion, stable identity, durable local recovery, exactly-once logical mutations, safe OCC behavior, and one authoritative completed workout.

**Architecture:** Keep Zustand as the single durable local active-session truth, add persisted logical mutation state and a monotonically increasing local session revision, and move autosync/finish networking into one session-sync coordinator mounted from \`Layout\`. Canonical completed working sets are projected through one pure helper and reused by finish, summary, history-facing cache updates, and deterministic analytics. Server workout routes keep OCC/audit behavior but make idempotency deterministic across retries.

**Tech Stack:** React 19, TypeScript, Zustand persist, Express, Firebase Admin/Firestore, existing idempotency/OCC helpers, tsx test runner.

**Spec:** \`docs/superpowers/specs/2026-09-21-dogfood-gate-1-design.md\`

## Global Constraints

- Preserve server-authoritative mutations.
- Preserve authenticated user identity and Firestore client-write restrictions.
- Preserve OCC/version checks.
- Preserve idempotency protection, audit logs, and rollback semantics.
- Preserve stable canonical exercise identity.
- Preserve deterministic analytics.
- Preserve local-first active-session behavior.
- Preserve existing security regression coverage.
- Do not add Brain features, naming work, templates, advanced analytics, recommendation tuning, or broad UI redesign.
- The current Home design direction remains frozen during this gate.

## Review Focus

1. **Lost response after a successful server write:** retry the same logical operation with the same mutation ID and receive the cached replay without a second version increment.
2. **User edits while autosync is in flight:** a stale success response must not overwrite newer local edits; only authoritative server metadata/version may be merged before the follow-up sync.
3. **Reload with a pending operation:** persisted pending mutation, captured revision, local draft, and conflict state must rehydrate so the same logical operation is retried rather than replaced with a new UUID.
4. **OCC conflict:** preserve the local draft and authoritative server snapshot; never “force override” by substituting the server’s current version into stale local updates.
5. **Set classification edge cases:** a completed bodyweight set with \`weight = 0\` still counts as a completed set, while warm-up set type \`W\` is excluded from the canonical working-set projection and analytics.

---

### Task 1: Create one canonical completed-working-set projection

**Files:**
- Create: \`src/lib/workout-session.ts\`
- Modify: \`src/lib/validation.ts:1-260\`
- Test: \`tests/dogfood_session_projection.test.ts\`

**Interfaces:**
- Consumes: \`Workout\`, \`WorkoutExercise\`, \`WorkoutSet\`, \`WorkoutSetItem\`.
- Produces:
  - \`isWorkingSetType(setType): boolean\`
  - \`projectCompletedWorkingExercises(workout): WorkoutExercise[]\`
  - \`projectCompletedWorkingSets(workout): WorkoutSetItem[]\`
  - \`buildCompletionPayload(workout, completedAt, durationSeconds): WorkoutCompletionPayload\`

- [ ] **Step 1: Write the failing projection tests**

~~~ts
import {
  buildCompletionPayload,
  projectCompletedWorkingSets,
} from '../src/lib/workout-session';
import { Workout } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const workout: Workout = {
  id: 'w_gate1',
  userId: 'u1',
  title: 'Push',
  scheduledDate: '2026-09-21',
  status: 'IN_PROGRESS',
  version: 4,
  sets: [],
  exercises: [{
    id: 'ex_bench',
    exerciseId: 'barbell-bench-press',
    sets: [
      { id: 's_work', weight: 80, reps: 8, completed: true, setType: 'N' },
      { id: 's_warm', weight: 40, reps: 10, completed: true, setType: 'W' },
      { id: 's_typed', weight: 85, reps: 8, completed: false, setType: 'N' },
      { id: 's_bodyweight', weight: 0, reps: 12, completed: true, setType: 'N' },
    ],
  }],
};

const canonical = projectCompletedWorkingSets(workout);
assert(canonical.map(s => s.id).join(',') === 's_work,s_bodyweight',
  'only explicitly completed non-warmup sets should survive');
assert(canonical[1].weight === 0,
  'bodyweight set must not be dropped just because weight is zero');

const completion = buildCompletionPayload(workout, 1_800_000_000_000, 2710);
assert(completion.updates.status === 'COMPLETED', 'finish status must be completed');
assert(completion.updates.exercises?.[0].id === 'ex_bench', 'exercise identity must be preserved');
assert(completion.updates.sets?.[0].id === 's_work', 'set identity must be preserved');
assert(completion.totalVolume === 640, 'volume should be 80*8 + 0*12');
~~~

- [ ] **Step 2: Run the new test and verify it fails**

Run:

~~~bash
npx tsx tests/dogfood_session_projection.test.ts
~~~

Expected: FAIL because \`src/lib/workout-session.ts\` does not exist.

- [ ] **Step 3: Implement the pure canonical projection**

Use one representation only: prefer structured \`exercises[].sets\` when present; otherwise use flat \`sets\`. A working set is explicitly completed and is not set type \`W\`. Do **not** require \`weight > 0\`.

Core shape:

~~~ts
export function isWorkingSetType(setType?: WorkoutSet['setType'] | WorkoutSetItem['setType']) {
  return setType !== 'W';
}

export function projectCompletedWorkingExercises(workout: Workout): WorkoutExercise[] {
  if (!workout.exercises?.length) return [];

  return workout.exercises
    .map(ex => ({
      ...ex,
      sets: ex.sets.filter(set => set.completed === true && isWorkingSetType(set.setType)),
    }))
    .filter(ex => ex.sets.length > 0);
}

export function projectCompletedWorkingSets(workout: Workout): WorkoutSetItem[] {
  const structured = projectCompletedWorkingExercises(workout);
  if (structured.length > 0) {
    return structured.flatMap(ex =>
      ex.sets.map(set => ({
        id: set.id,
        exercise: ex.exerciseId,
        weight: set.weight,
        reps: set.reps,
        rir: set.rir,
        rpe: set.rpe,
        notes: set.notes,
        completed: true,
        setType: set.setType === 'normal' ? 'N' : set.setType,
      }))
    );
  }

  return (workout.sets || []).filter(
    set => set.completed === true && isWorkingSetType(set.setType)
  );
}
~~~

\`buildCompletionPayload\` must return updates, duration, and total volume without incrementing \`version\` locally. Extend \`validateWorkoutUpdates\` to accept finite non-negative \`totalVolume\` so the server can persist the same authoritative total.

- [ ] **Step 4: Re-run the projection test**

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/workout-session.ts src/lib/validation.ts tests/dogfood_session_projection.test.ts
git commit -m "feat: canonicalize completed workout sets"
~~~

---

### Task 2: Make workout mutation identity caller-owned and retry-stable

**Files:**
- Modify: \`src/lib/api.ts:126-180,995-1040\`
- Modify: \`src/lib/idempotency-guard.ts\`
- Modify: \`server.ts:922-1155\`
- Modify: every \`mutateWorkout(...)\` call site to use the options object
- Test: \`tests/authoritative_pipeline.test.ts:23+\`
- Test: \`tests/dogfood_idempotency_regression.test.ts\`

**Interfaces:**
- Produces:
  - \`WorkoutMutationOptions { mutationId: string; duration?: number; volume?: number }\`
  - \`SaveWorkoutOptions { mutationId?: string }\`
  - \`WorkoutConflictError\`
  - \`hashCreateWorkoutPayload(...)\`
- Changes \`mutateWorkout\` signature to:
  \`mutateWorkout(workoutId, baseVersion, updates, options)\`.

- [ ] **Step 1: Write failing tests for stable logical identity**

~~~ts
import {
  hashCreateWorkoutPayload,
  hashMutationPayload,
  evaluateIdempotencyRecord,
} from '../src/lib/idempotency-guard';

const workoutA = {
  id: 'w1',
  userId: 'u1',
  title: 'Push',
  scheduledDate: '2026-09-21',
  status: 'COMPLETED',
  version: 1,
  sets: [],
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

const workoutB = {
  ...workoutA,
  createdAt: '2026-09-21T10:00:01.000Z',
  updatedAt: '2026-09-21T10:00:01.000Z',
};

const h1 = hashCreateWorkoutPayload('w1', workoutA, 'USER', 'finish fallback');
const h2 = hashCreateWorkoutPayload('w1', workoutB, 'USER', 'finish fallback');
if (h1 !== h2) throw new Error('server-generated timestamps must not change create idempotency hash');

const record = {
  mutationId: '11111111-1111-4111-8111-111111111111',
  userId: 'u1',
  targetId: 'w1',
  payloadHash: h1,
  result: workoutA,
  createdAt: workoutA.createdAt,
};

const replay = evaluateIdempotencyRecord(record, 'w1', h2, 'u1');
if (replay.status !== 'REPLAY') throw new Error('same logical create must replay');
~~~

- [ ] **Step 2: Run and verify failure**

Run:

~~~bash
npx tsx tests/dogfood_idempotency_regression.test.ts
~~~

Expected: FAIL because \`hashCreateWorkoutPayload\` does not exist.

- [ ] **Step 3: Add deterministic create hashing**

In \`src/lib/idempotency-guard.ts\`, hash create payloads after removing server-managed timestamps:

~~~ts
export function hashCreateWorkoutPayload(
  workoutId: string,
  workout: Workout,
  actor: string | undefined,
  summary: string | undefined
): string {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...stableWorkout } = workout;
  return hashMutationPayload(workoutId, {
    workout: stableWorkout,
    actor: actor || 'USER',
    summary: summary || 'Created initial workout routine',
  });
}
~~~

Use this helper in \`POST /api/workouts\` instead of hashing the timestamp-bearing object directly.

- [ ] **Step 4: Make API mutation IDs explicit**

Replace the current hidden \`crypto.randomUUID()\` in \`mutateWorkout\` with:

~~~ts
export interface WorkoutMutationOptions {
  mutationId: string;
  duration?: number;
  volume?: number;
}

export class WorkoutConflictError extends Error {
  status = 409;
  currentVersion?: number;
  workout?: Workout;

  constructor(message: string, currentVersion?: number, workout?: Workout) {
    super(message);
    this.name = 'WorkoutConflictError';
    this.currentVersion = currentVersion;
    this.workout = workout;
  }
}
~~~

\`mutateWorkout\` must serialize the caller’s exact \`mutationId\`.

Allow \`saveWorkout(..., options?: SaveWorkoutOptions)\` so the finish fallback can reuse a pre-existing logical mutation ID. Default to a new UUID only when no caller-supplied ID exists.

- [ ] **Step 5: Require a mutation ID on authoritative workout routes**

In the create and mutate routes, reject missing/blank \`mutationId\` with 400 before opening a transaction.

Use the same mutation ID in audit and idempotency records.

- [ ] **Step 6: Update non-core call sites**

For one-shot manual edits, create a UUID at the call site:

~~~ts
await mutateWorkout(id, version, updates, {
  mutationId: crypto.randomUUID(),
  duration,
  volume,
});
~~~

Do not add auto-retry to those paths.

- [ ] **Step 7: Run idempotency and pipeline tests**

~~~bash
npx tsx tests/dogfood_idempotency_regression.test.ts
npx tsx tests/authoritative_pipeline.test.ts
npx tsx tests/mutations.test.ts
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add src/lib/api.ts src/lib/idempotency-guard.ts server.ts src tests
git commit -m "fix: make workout mutations retry-idempotent"
~~~

---

### Task 3: Persist active-session revision, pending mutation, and conflict state

**Files:**
- Modify: \`src/types.ts\`
- Modify: \`src/store/useWorkoutStore.ts:5-210\`
- Create: \`src/lib/workout-reconcile.ts\`
- Test: \`tests/dogfood_active_state_regression.test.ts\`

**Interfaces:**
- Produces:
  - \`WorkoutMutationKind = 'AUTOSYNC' | 'FINISH'\`
  - \`PendingWorkoutMutation\`
  - \`WorkoutSyncConflict\`
  - \`reconcileAuthoritativeWorkout(...)\`
  - store actions for queue/clear/apply/conflict resolution.

- [ ] **Step 1: Write failing reconciliation/persistence-selection tests**

~~~ts
import { reconcileAuthoritativeWorkout } from '../src/lib/workout-reconcile';
import { selectPersistedWorkoutState } from '../src/store/useWorkoutStore';

const local = {
  id: 'w1',
  title: 'Push',
  scheduledDate: '2026-09-21',
  status: 'IN_PROGRESS',
  version: 2,
  sets: [],
  exercises: [{
    id: 'ex1',
    exerciseId: 'bench',
    sets: [{ id: 's1', weight: 82.5, reps: 8, completed: true }],
  }],
};

const server = {
  ...local,
  version: 3,
  exercises: [{
    id: 'ex1',
    exerciseId: 'bench',
    sets: [{ id: 's1', weight: 80, reps: 8, completed: true }],
  }],
};

const reconciled = reconcileAuthoritativeWorkout(local as any, server as any, 5, 6);
if (reconciled.version !== 3) throw new Error('server version must advance');
if (reconciled.exercises?.[0].sets[0].weight !== 82.5)
  throw new Error('newer local edit must survive an older in-flight response');

const persisted = selectPersistedWorkoutState({
  activeWorkout: local,
  sessionRevision: 6,
  pendingMutation: { mutationId: 'm1' },
  syncConflict: { currentVersion: 3 },
  isModalOpen: true,
} as any);

if ((persisted as any).isModalOpen !== undefined)
  throw new Error('modal UI state must not persist');
if (!persisted.pendingMutation)
  throw new Error('pending logical operation must persist across reload');
~~~

- [ ] **Step 2: Verify failure**

Run:

~~~bash
npx tsx tests/dogfood_active_state_regression.test.ts
~~~

- [ ] **Step 3: Add the new types**

Use persisted operation shape:

~~~ts
export interface PendingWorkoutMutation {
  mutationId: string;
  kind: 'AUTOSYNC' | 'FINISH';
  workoutId: string;
  baseVersion: number;
  updates: Partial<Workout>;
  duration?: number;
  volume?: number;
  capturedRevision: number;
  createdAt: number;
}

export interface WorkoutSyncConflict {
  mutationId: string;
  currentVersion: number;
  serverWorkout: Workout;
  detectedAt: number;
}
~~~

- [ ] **Step 4: Add revision tracking to the workout store**

\`sessionRevision\` starts at 0 when a workout starts and increments for user edits: set changes, adding/removing sets, adding/removing exercises, and direct active-workout edits.

Do not increment the user-edit revision merely because authoritative server metadata/version is merged.

Persist:
- active workout
- started/rest timestamps
- last synced timestamp
- session revision
- pending mutation
- conflict snapshot

Do not persist modal-open state.

- [ ] **Step 5: Add explicit server reconciliation**

\`reconcileAuthoritativeWorkout(local, authoritative, capturedRevision, currentRevision)\` returns the authoritative object when no newer local edits exist. If the current local revision is newer than the captured revision, preserve local mutable session fields and merge only authoritative server identity/version/timestamps needed for the next OCC write.

- [ ] **Step 6: Add safe conflict resolution**

Store action:
- \`resolveConflictWithServer()\` replaces the local active workout with the stored server snapshot, clears pending/conflict/error state, and resets the session revision baseline.
- No “force local overwrite” action in Gate 1.

- [ ] **Step 7: Re-run the state regression test**

Expected: PASS.

- [ ] **Step 8: Commit**

~~~bash
git add src/types.ts src/store/useWorkoutStore.ts src/lib/workout-reconcile.ts tests/dogfood_active_state_regression.test.ts
git commit -m "feat: persist workout sync operation state"
~~~

---

### Task 4: Move autosync into one mounted session-sync coordinator

**Files:**
- Create: \`src/lib/workout-sync.ts\`
- Create: \`src/hooks/useWorkoutSessionSync.ts\`
- Modify: \`src/layouts/Layout.tsx:39-135\`
- Modify: \`src/components/workout/ActiveWorkoutBottomBar.tsx:95-140\`
- Test: \`tests/dogfood_sync_regression.test.ts\`

**Interfaces:**
- \`createWorkoutSyncController(deps)\` produces:
  - \`requestAutosync()\`
  - \`retryPending()\`
  - \`finishActiveWorkout()\`
  - \`isInFlight()\`
- \`useWorkoutSessionSync()\` mounts one 45-second timer and returns \`finishActiveWorkout\`.

- [ ] **Step 1: Write the deterministic sync-controller tests**

The test uses a fake transport and fake persisted store. It must prove:
- one request at a time
- same pending mutation ID reused after a simulated lost response
- edit during in-flight response is preserved
- follow-up sync uses the returned server version
- 409 stores conflict and does not auto-rebase stale updates

Representative fake transport:

~~~ts
const calls: any[] = [];
let first = true;

const transport = async (op: PendingWorkoutMutation) => {
  calls.push(op);
  if (first) {
    first = false;
    // Simulate: server committed, response was lost.
    throw Object.assign(new Error('network lost'), { status: 0 });
  }
  return {
    ...activeWorkout,
    version: op.baseVersion + 1,
    ...op.updates,
  };
};

await controller.requestAutosync();
const firstId = state.pendingMutation!.mutationId;

await controller.retryPending();
if (calls[1].mutationId !== firstId)
  throw new Error('transport retry must reuse logical mutation ID');
~~~

Add the in-flight edit assertion from Review Focus #2.

- [ ] **Step 2: Verify failure**

~~~bash
npx tsx tests/dogfood_sync_regression.test.ts
~~~

- [ ] **Step 3: Implement the controller**

The controller owns only ephemeral \`inFlight\` state. Logical operation state stays in Zustand so it survives reload.

Rules:
1. If a pending operation exists, retry it; do not create a new UUID.
2. Snapshot active workout + \`sessionRevision\` before a new autosync.
3. Persist the operation before network delivery.
4. On network/5xx failure, keep it pending.
5. On success, reconcile with the captured revision, clear pending, and if newer local edits exist, schedule exactly one follow-up sync.
6. On OCC 409 with server snapshot, clear pending, store conflict, block further autosync.
7. No overlapping writes for one active workout.

- [ ] **Step 4: Mount exactly one scheduler from Layout**

Call \`useWorkoutSessionSync()\` before any early return in \`Layout\`.

The hook:
- creates one 45-second interval while an active workout exists
- retries an existing pending mutation immediately after rehydration
- retries pending network failures when the browser fires \`online\`
- clears its timer/listener on unmount or when active workout ID changes

- [ ] **Step 5: Remove autosync side effects from ActiveWorkoutBottomBar**

The component can remain presentation-only, but it must not own a second 45-second sync effect. This also prevents accidental duplicate timers if the bottom bar is re-mounted later.

- [ ] **Step 6: Run sync regression tests**

~~~bash
npx tsx tests/dogfood_sync_regression.test.ts
npx tsx tests/phase2_reliability_regression.test.ts
~~~

Update the old Phase 2 static autosync test so it checks the new hook/coordinator rather than dead \`ActiveWorkoutBottomBar\` code.

- [ ] **Step 7: Commit**

~~~bash
git add src/lib/workout-sync.ts src/hooks/useWorkoutSessionSync.ts src/layouts/Layout.tsx src/components/workout/ActiveWorkoutBottomBar.tsx tests
git commit -m "feat: centralize durable workout autosync"
~~~

---

### Task 5: Make finish one durable authoritative logical mutation

**Files:**
- Modify: \`src/lib/workout-sync.ts\`
- Modify: \`src/hooks/useWorkoutSessionSync.ts\`
- Modify: \`src/components/workout/ActiveWorkout.tsx:32-205\`
- Modify: \`src/components/workout/GymSetRow.tsx\`
- Modify: \`src/layouts/Layout.tsx:118-135\`
- Modify: \`src/components/workout/LiftOffSummary.tsx:22-95\`
- Test: \`tests/dogfood_finish_regression.test.ts\`

**Interfaces:**
- \`finishActiveWorkout(): Promise<Workout>\` resolves only with the authoritative server-returned completed workout.

- [ ] **Step 1: Write finish failure/replay/authority tests**

Test three cases:

1. Transport failure before authoritative response leaves:
   - active workout intact
   - \`pendingMutation.kind === 'FINISH'\`
   - same finish mutation ID available for retry.

2. Lost response after server commit, then retry:
   - same mutation ID
   - one logical completion
   - one version increment
   - authoritative replay returned.

3. Authoritative server normalization:
   - fake server returns version 8 and a normalized title/metadata
   - the object handed to post-workout summary is exactly that server object, not the locally built draft.

- [ ] **Step 2: Verify failure**

~~~bash
npx tsx tests/dogfood_finish_regression.test.ts
~~~

- [ ] **Step 3: Implement finish in the coordinator**

Flow:

~~~ts
async function finishActiveWorkout(): Promise<Workout> {
  const state = deps.getState();
  if (!state.activeWorkout) throw new Error('NO_ACTIVE_WORKOUT');

  const existing = state.pendingMutation;
  const operation = existing?.kind === 'FINISH'
    ? existing
    : makeFinishOperation(state.activeWorkout, state.sessionRevision);

  deps.queuePendingMutation(operation);

  try {
    const authoritative = await deps.mutate(operation);
    deps.cacheAuthoritativeWorkout(authoritative);
    deps.completeWorkout(authoritative);
    return authoritative;
  } catch (err: any) {
    if (err.status === 404) {
      const created = await deps.createCompletedWorkout(operation);
      deps.cacheAuthoritativeWorkout(created);
      deps.completeWorkout(created);
      return created;
    }
    throw err;
  }
}
~~~

The 404 creation fallback must use the **same** finish mutation ID and the deterministic create hash from Task 2.

- [ ] **Step 4: Remove local completion authority from ActiveWorkout**

Delete the local \`version + 1\` completed-workout construction and direct \`mutateWorkout/saveWorkout\` calls.

\`ActiveWorkout\` should call the injected \`finishActiveWorkout\`, then:

~~~ts
const authoritative = await finishActiveWorkout();
onWorkoutFinished?.(authoritative);
~~~

Do not clear the store before that promise resolves.

- [ ] **Step 5: Lock editing while finish is pending**

Expose whether the pending operation is \`FINISH\`.

While true:
- disable complete/uncomplete controls
- disable weight/reps editors
- disable add/remove set and add/remove exercise actions
- label button \`Finishing...\`

A network-unknown finish remains pending and retryable rather than allowing additional edits that are outside the frozen completion payload.

- [ ] **Step 6: Use canonical projection in LiftOffSummary**

Replace \`weight > 0\` filtering with \`projectCompletedWorkingSets(workout)\`.

The summary must count a completed bodyweight set as a set even if its external-load volume is zero.

- [ ] **Step 7: Run finish tests**

~~~bash
npx tsx tests/dogfood_finish_regression.test.ts
npx tsx tests/dogfood_session_projection.test.ts
~~~

- [ ] **Step 8: Commit**

~~~bash
git add src/lib/workout-sync.ts src/hooks/useWorkoutSessionSync.ts src/components/workout src/layouts/Layout.tsx tests
git commit -m "fix: make workout finish authoritative"
~~~

---

### Task 6: Eliminate unsafe OCC rebasing and preserve stable exercise identity in manual edits

**Files:**
- Modify: \`src/components/WorkoutDetailModal.tsx:582-660\`
- Modify: \`src/lib/workout-session.ts\`
- Test: \`tests/dogfood_occ_identity_regression.test.ts\`

**Interfaces:**
- Add \`rebuildExercisesPreservingIdentity(flatSets, existingExercises)\`.

- [ ] **Step 1: Write failing identity/OCC source behavior tests**

Identity case:

~~~ts
const rebuilt = rebuildExercisesPreservingIdentity(
  [
    { id: 's1', exercise: 'Bench Press', weight: 80, reps: 8, completed: true },
    { id: 's2', exercise: 'Bench Press', weight: 80, reps: 8, completed: true },
  ],
  [{
    id: 'existing-exercise-id',
    exerciseId: 'barbell-bench-press',
    name: 'Bench Press',
    sets: [],
  }]
);

if (rebuilt[0].id !== 'existing-exercise-id')
  throw new Error('saving an existing exercise must not generate a new exercise id');
~~~

Also add a source assertion that the modal no longer contains the \`Force override?\` branch or a retry using \`e.currentVersion\`.

- [ ] **Step 2: Verify failure**

~~~bash
npx tsx tests/dogfood_occ_identity_regression.test.ts
~~~

- [ ] **Step 3: Reuse exercise IDs when rebuilding structured exercises**

Match an existing exercise by canonical \`exerciseId\` first, then exact name/registry alias. Generate a UUID only for a genuinely new exercise.

Set IDs always come from the existing flat rows.

- [ ] **Step 4: Remove “force override” OCC behavior**

On \`WorkoutConflictError\`:
- keep the modal/editor state
- show a conflict message with server version
- do not call \`mutateWorkout\` again using \`e.currentVersion\`
- provide an explicit “Reload server version” action if \`e.workout\` exists
- otherwise let the user close/reopen after refresh

No automatic merge in Gate 1.

- [ ] **Step 5: Add active-session conflict banner**

When the central sync store contains \`syncConflict\`, show:

\`Sync conflict — server is at vX. Your local draft is still safe.\`

Provide:
- **Use server version** → \`resolveConflictWithServer()\`
- **Keep draft for now** → leaves conflict unresolved and autosync blocked

Do not provide a force-write action.

- [ ] **Step 6: Run OCC/identity tests**

~~~bash
npx tsx tests/dogfood_occ_identity_regression.test.ts
npx tsx tests/phase0_security_regression.test.ts
~~~

- [ ] **Step 7: Commit**

~~~bash
git add src/components/WorkoutDetailModal.tsx src/components/workout/ActiveWorkout.tsx src/lib/workout-session.ts tests
git commit -m "fix: preserve workout identity across OCC conflicts"
~~~

---

### Task 7: Make deterministic analytics consume the canonical completed-set truth once

**Files:**
- Modify: \`src/lib/hypertrophy.ts:95+\`
- Modify: \`src/lib/progression.ts:42+\`
- Modify: \`src/components/workout/LiftOffSummary.tsx\`
- Modify if needed: \`src/lib/sessionCompare.ts\`
- Test: \`tests/dogfood_analytics_regression.test.ts\`

**Interfaces:**
- All touched analytics consume \`projectCompletedWorkingSets\` or the equivalent canonical structured projection from Task 1.

- [ ] **Step 1: Write failing analytics tests**

Construct a completed workout containing:
- nested exercise sets and a duplicate legacy flat representation
- one normal completed set
- one warm-up completed set
- one incomplete typed set
- one bodyweight completed set with weight 0

Assert:
- hypertrophy counts the normal + bodyweight working sets once, not duplicated
- warm-up and incomplete sets are not counted
- progression never treats the warm-up as the top working set
- summary set count equals the canonical working-set count

- [ ] **Step 2: Run and verify failure**

~~~bash
npx tsx tests/dogfood_analytics_regression.test.ts
~~~

- [ ] **Step 3: Replace local analytics filtering with the shared projection**

\`calculatePhysiqueHypertrophyVolume\` must no longer maintain an independent “prefer nested else flat” completion policy.

\`extractExerciseHistory\` must filter through the same canonical set source before exercise matching.

Keep e1RM behavior unchanged for zero external load: the bodyweight set can count as a completed set, while e1RM remains 0 unless a bodyweight-aware load model exists in a future scope.

- [ ] **Step 4: Run analytics regressions**

~~~bash
npx tsx tests/dogfood_analytics_regression.test.ts
npx tsx tests/progression.test.ts
npx tsx tests/security_and_loop.test.ts
~~~

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/hypertrophy.ts src/lib/progression.ts src/lib/sessionCompare.ts src/components/workout/LiftOffSummary.tsx tests
git commit -m "fix: unify completed-set analytics"
~~~

---

### Task 8: Add one end-to-end deterministic Dogfood Gate 1 regression

**Files:**
- Create: \`tests/dogfood_gate1_integration.test.ts\`
- Modify: \`package.json:13-16\`

**Interfaces:**
- Uses the real canonical projection, sync controller, reconciliation helper, idempotency helper, hypertrophy calculator, and progression extractor.
- Uses an in-memory fake authoritative workout transport; no network, Firebase credentials, or wall clock dependency.

- [ ] **Step 1: Write the full scenario**

The test sequence must be exactly:

1. start planned workout
2. complete set A
3. type values into set B but leave it incomplete
4. queue autosync
5. serialize/rehydrate persisted state
6. retry the same pending autosync ID after simulated lost response
7. make another completed-set edit
8. autosync again on the authoritative returned version
9. finish with one stable finish ID
10. read the authoritative completed workout as “history”
11. run hypertrophy/progression/basic summary projections

Core final assertions:

~~~ts
assert(history.status === 'COMPLETED', 'history must contain completed authoritative workout');
assert(history.version === expectedServerVersion, 'history version must be server authoritative');

const ids = projectCompletedWorkingSets(history).map(s => s.id);
assert(ids.includes('completed_a'), 'explicit completed set must survive');
assert(!ids.includes('typed_incomplete_b'), 'typed but incomplete set must not become phantom history');

assert(summarySetCount === ids.length, 'summary and history must use same canonical sets');
assert(hypertrophyCount === expectedWorkingSets, 'hypertrophy must consume canonical working sets once');
assert(allLogicalRetriesReusedIds, 'retries must reuse logical mutation IDs');
~~~

- [ ] **Step 2: Run the integration test**

~~~bash
npx tsx tests/dogfood_gate1_integration.test.ts
~~~

Expected: PASS.

- [ ] **Step 3: Add all Dogfood Gate tests to \`npm test\`**

Keep existing security/reliability suites. Append:
- \`dogfood_session_projection.test.ts\`
- \`dogfood_idempotency_regression.test.ts\`
- \`dogfood_active_state_regression.test.ts\`
- \`dogfood_sync_regression.test.ts\`
- \`dogfood_finish_regression.test.ts\`
- \`dogfood_occ_identity_regression.test.ts\`
- \`dogfood_analytics_regression.test.ts\`
- \`dogfood_gate1_integration.test.ts\`

- [ ] **Step 4: Commit**

~~~bash
git add tests/dogfood_* package.json
git commit -m "test: freeze Dogfood Gate 1 workout loop"
~~~

---

### Task 9: Repair the accidental README regression and run final verification

**Files:**
- Modify: \`README.md:1+\`

**Interfaces:**
- Documentation only; no runtime interface changes.

- [ ] **Step 1: Replace the placeholder README**

Remove generic placeholder text such as:
- “Feature 1”
- “A brief, catchy description”
- example language/framework brackets

Restore a FORGE-specific README containing:
- product purpose: trustworthy adaptive strength-training loop
- current stack
- local install/run/test commands
- current project status
- the Dogfood Gate 1 reliability focus
- no claim that the project is MIT-licensed unless the repository actually has and intends that license

- [ ] **Step 2: Run typecheck**

~~~bash
npm run lint
~~~

Expected: exit 0.

- [ ] **Step 3: Run the complete test suite**

~~~bash
npm test
~~~

Expected: exit 0 with all old and new suites green.

- [ ] **Step 4: Run production build**

~~~bash
npm run build
~~~

Expected: exit 0 and Vite/server bundle produced.

- [ ] **Step 5: Review the final diff for Gate 1 scope**

~~~bash
git diff --stat HEAD~9..HEAD
git diff HEAD~9..HEAD -- src/lib src/store src/hooks src/components/workout src/layouts server.ts tests package.json README.md
~~~

Reject unrelated Brain, naming, Home redesign, or advanced analytics changes.

- [ ] **Step 6: Commit README if it was not included earlier**

~~~bash
git add README.md
git commit -m "docs: restore FORGE project README"
~~~

---

### Task 10: Manual real-phone dogfood gate

**Files:** None.

**Interfaces:** Uses the built/deployed app exactly as a normal gym session would.

- [ ] **Step 1: Start one workout on the phone**

Use at least two exercises.

- [ ] **Step 2: Create a phantom-set trap**

Type weight/reps into one set but do **not** mark it complete.

- [ ] **Step 3: Complete at least two other working sets**

If practical, include one bodyweight movement or a zero-external-load set.

- [ ] **Step 4: Background the app and reopen it**

Confirm the active workout, completed flags, values, IDs-visible behavior, elapsed session, and rest state recover correctly.

- [ ] **Step 5: Reload/restart once**

Confirm the same draft returns and no duplicate workout appears.

- [ ] **Step 6: Allow at least one 45-second autosync**

Continue editing after an autosync starts so the “edit while request is in flight” path is exercised naturally.

- [ ] **Step 7: Finish the workout**

If connectivity can safely be toggled, interrupt the first finish attempt once, restore connectivity, and retry. The session must not duplicate.

- [ ] **Step 8: Reopen history**

Manually compare every completed set against what was logged. The typed-but-incomplete trap set must be absent.

- [ ] **Step 9: Check summary/basic analytics**

Set count and volume must match the canonical completed working sets. No warm-up/duplicate representation should inflate the totals.

- [ ] **Step 10: Record the gate result**

Do not call Dogfood Gate 1 complete until:
- automated suite is green
- build/typecheck are green
- this real-device pass succeeds
- no duplicate session/set, phantom completion, lost reload state, or silent OCC overwrite occurs
