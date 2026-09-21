export interface StateStorageLike {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem(name: string): void | Promise<void>;
}

export function createSafeStateStorage(
  storage: StateStorageLike,
  onError: (message: string) => void
): StateStorageLike {
  const report = (operation: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    onError(`Workout persistence ${operation} failed: ${detail}`);
  };
  return {
    getItem(name) {
      try {
        const result = storage.getItem(name);
        if (result instanceof Promise) return result.catch((error) => { report('read', error); return null; });
        return result;
      } catch (error) { report('read', error); return null; }
    },
    setItem(name, value) {
      try {
        const result = storage.setItem(name, value);
        if (result instanceof Promise) return result.catch((error) => { report('write', error); });
        return result;
      } catch (error) { report('write', error); }
    },
    removeItem(name) {
      try {
        const result = storage.removeItem(name);
        if (result instanceof Promise) return result.catch((error) => { report('remove', error); });
        return result;
      } catch (error) { report('remove', error); }
    },
  };
}
