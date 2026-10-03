function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  get length(): number { return this.values.size; }
}

const localStorage = new MemoryStorage();
localStorage.setItem(
  'forge-active-workout-v2',
  JSON.stringify({
    state: {
      activeWorkout: {},
      startedAt: Date.now(),
      sessionRevision: 4,
      pendingMutation: null,
      syncConflict: null,
    },
    version: 0,
  })
);
(globalThis as any).window = { localStorage };
(globalThis as any).localStorage = localStorage;

const { useWorkoutStore } = await import('../src/store/useWorkoutStore');
const state = useWorkoutStore.getState();

assert(state.activeWorkout === null, 'invalid persisted activeWorkout shape must recover to no active workout');
assert(
  typeof state.persistenceWarning === 'string' &&
  state.persistenceWarning.includes('Workout persistence read failed'),
  `invalid persisted activeWorkout shape must surface a recovery warning; got ${String(state.persistenceWarning)}`
);

console.log('Active workout invalid-shape hydration regression passed');
