import { reconcileAuthoritativeWorkout } from '../src/lib/workout-reconcile';
import { createSafeStateStorage } from '../src/lib/safe-storage';
import { selectPersistedWorkoutState } from '../src/store/useWorkoutStore';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const local = {
  id: 'w1',
  userId: 'u1',
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
assert(reconciled.version === 3, 'server version must advance');
assert(reconciled.exercises?.[0].sets[0].weight === 82.5,
  'newer local edit must survive an older in-flight response');

const settled = reconcileAuthoritativeWorkout(local as any, server as any, 5, 5);
assert(settled.exercises?.[0].sets[0].weight === 80,
  'authoritative server state should replace local when no newer edit exists');

const persisted = selectPersistedWorkoutState({
  activeWorkout: local,
  sessionRevision: 6,
  pendingMutation: {
    mutationId: 'm1',
    kind: 'AUTOSYNC',
    workoutId: 'w1',
    baseVersion: 2,
    updates: {},
    capturedRevision: 5,
    createdAt: 1,
  },
  syncConflict: {
    mutationId: 'm2',
    currentVersion: 3,
    serverWorkout: server,
    detectedAt: 2,
  },
  startedAt: 1,
  restEndTime: null,
  lastSyncedAt: 3,
  isModalOpen: true,
  persistenceWarning: 'ignore me',
} as any);

assert((persisted as any).isModalOpen === undefined, 'modal UI state must not persist');
assert((persisted as any).persistenceWarning === undefined, 'warning UI state must not persist');
assert(!!persisted.pendingMutation, 'pending logical operation must persist across reload');
assert(!!persisted.syncConflict, 'conflict snapshot must persist across reload');

let persistenceError = '';
const throwingStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => { throw new Error('quota'); },
  removeItem: (_name: string) => undefined,
};
const safeStorage = createSafeStateStorage(throwingStorage as any, message => {
  persistenceError = message;
});
safeStorage.setItem('forge-active-workout-v2', '{}');
assert(!!persistenceError, 'persistence failure must surface through the error callback');

console.log('✔ Dogfood active state regression passed');
