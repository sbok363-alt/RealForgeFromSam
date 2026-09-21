import { createWorkoutSyncController, WorkoutSyncControllerDeps } from '../src/lib/workout-sync';
import { projectCompletedWorkingSets } from '../src/lib/workout-session';
import { calculatePhysiqueHypertrophyVolume } from '../src/lib/hypertrophy';
import { extractExerciseHistory } from '../src/lib/progression';
import { PendingWorkoutMutation, Workout } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const now = Date.now();
const base: Workout = {
  id: 'gate1-e2e',
  userId: 'u1',
  title: 'Push',
  scheduledDate: new Date(now).toISOString().slice(0, 10),
  status: 'IN_PROGRESS',
  version: 1,
  startedAt: now - 60_000,
  sets: [],
  exercises: [{
    id: 'ex-bench',
    exerciseId: 'bench_press',
    sets: [
      { id: 'completed_a', weight: 80, reps: 8, completed: true, setType: 'N' },
      { id: 'typed_incomplete_b', weight: 85, reps: 8, completed: false, setType: 'N' },
      { id: 'completed_c', weight: 82.5, reps: 8, completed: true, setType: 'N' },
    ],
  }],
};

let state: any = {
  activeWorkout: base,
  sessionRevision: 2,
  pendingMutation: null,
  syncConflict: null,
  lastSyncedAt: null,
};
let server = base;
let loseFirstAutosyncResponse = true;
let uuidIndex = 0;
const calls: PendingWorkoutMutation[] = [];
let authoritativeHistory: Workout | null = null;

const deps: WorkoutSyncControllerDeps = {
  getState: () => state,
  queuePendingMutation: (operation) => { state = { ...state, pendingMutation: operation }; },
  clearPendingMutation: (mutationId) => {
    if (!mutationId || state.pendingMutation?.mutationId === mutationId) {
      state = { ...state, pendingMutation: null };
    }
  },
  applyAuthoritativeWorkout: (workout, capturedRevision) => {
    const local = state.activeWorkout as Workout;
    state = {
      ...state,
      activeWorkout: state.sessionRevision > capturedRevision
        ? { ...local, version: workout.version, updatedAt: workout.updatedAt }
        : workout,
    };
  },
  setSyncConflict: (conflict) => { state = { ...state, syncConflict: conflict }; },
  setLastSyncedAt: (timestamp) => { state = { ...state, lastSyncedAt: timestamp }; },
  mutate: async (operation) => {
    calls.push({ ...operation });
    if (operation.kind === 'AUTOSYNC') {
      if (loseFirstAutosyncResponse) {
        loseFirstAutosyncResponse = false;
        server = { ...server, ...operation.updates, version: 2 };
        throw new Error('response lost after commit');
      }
      return server;
    }
    assert(operation.baseVersion === 2, 'finish must use recovered authoritative autosync version');
    server = { ...server, ...operation.updates, version: 3 } as Workout;
    return server;
  },
  completeWorkout: (authoritative) => {
    authoritativeHistory = authoritative;
    state = { ...state, activeWorkout: null, pendingMutation: null };
  },
  uuid: () => `00000000-0000-4000-8000-${String(++uuidIndex).padStart(12, '0')}`,
  now: () => now,
};

const controller = createWorkoutSyncController(deps);

// Start -> explicit completed/incomplete sets -> autosync with lost response.
await controller.requestAutosync();
const lostAutosyncId = state.pendingMutation?.mutationId;
assert(Boolean(lostAutosyncId), 'lost autosync must remain persisted for retry');

// Simulated reload keeps the exact pending operation; Finish drains it first.
const completed = await controller.finishActiveWorkout();

assert(calls[0].mutationId === lostAutosyncId && calls[1].mutationId === lostAutosyncId,
  'lost autosync retry must reuse the same logical mutation id');
assert(calls.filter(call => call.kind === 'FINISH').length === 1,
  'exactly one FINISH logical mutation must be created');
assert(completed.version === 3 && completed.status === 'COMPLETED',
  'finish must return the authoritative completed workout');
assert(authoritativeHistory?.version === completed.version,
  'history handoff must be the authoritative server object');

const canonical = projectCompletedWorkingSets(completed);
assert(canonical.map(set => set.id).join(',') === 'completed_a,completed_c',
  'typed but incomplete set must never become phantom history');
assert(canonical.reduce((sum, set) => sum + set.weight * set.reps, 0) === 1300,
  'canonical volume must equal completed working-set volume');

const audit = calculatePhysiqueHypertrophyVolume([completed], undefined, false);
assert(audit.muscles.CHEST.week1Sets === 2,
  'hypertrophy must consume the same two canonical working sets once');

const progression = extractExerciseHistory([completed], 'bench_press');
assert(progression.length === 1 && progression[0].sets.length === 2,
  'progression history must consume the same canonical completed working sets');

console.log('✔ Dogfood Gate 1 integration regression passed');
