import type { StateStorage } from 'zustand/middleware';

function report(onError: (message: string) => void, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  onError(`Active workout persistence failed: ${detail}`);
}

export function createSafeStateStorage(
  storage: StateStorage,
  onError: (message: string) => void
): StateStorage {
  return {
    getItem(name) {
      try {
        const result = storage.getItem(name);
        if (result && typeof (result as Promise<string | null>).catch === 'function') {
          return (result as Promise<string | null>).catch((error) => {
            report(onError, error);
            return null;
          });
        }
        return result;
      } catch (error) {
        report(onError, error);
        return null;
      }
    },
    setItem(name, value) {
      try {
        const result = storage.setItem(name, value);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          return (result as Promise<void>).catch((error) => {
            report(onError, error);
          });
        }
        return result;
      } catch (error) {
        report(onError, error);
      }
    },
    removeItem(name) {
      try {
        const result = storage.removeItem(name);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          return (result as Promise<void>).catch((error) => {
            report(onError, error);
          });
        }
        return result;
      } catch (error) {
        report(onError, error);
      }
    },
  };
}
