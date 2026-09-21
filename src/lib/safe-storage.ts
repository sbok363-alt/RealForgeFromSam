export interface StateStorageLike {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem(name: string): void | Promise<void>;
}

export function createSafeStateStorage(
  storage: StateStorageLike,
  onError: (message: string) => void,
  onHealthy?: () => void
): StateStorageLike {
  let lastReportedError: string | null = null;

  const report = (operation: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Workout persistence ${operation} failed: ${detail}`;
    if (message === lastReportedError) return;
    lastReportedError = message;
    onError(message);
  };

  const markHealthy = () => {
    if (lastReportedError === null) return;
    lastReportedError = null;
    onHealthy?.();
  };

  return {
    getItem(name) {
      try {
        const result = storage.getItem(name);
        if (result instanceof Promise) {
          return result.then((value) => {
            markHealthy();
            return value;
          }).catch((error) => {
            report('read', error);
            return null;
          });
        }
        markHealthy();
        return result;
      } catch (error) {
        report('read', error);
        return null;
      }
    },
    setItem(name, value) {
      try {
        const result = storage.setItem(name, value);
        if (result instanceof Promise) {
          return result.then(() => {
            markHealthy();
          }).catch((error) => {
            report('write', error);
          });
        }
        markHealthy();
        return result;
      } catch (error) {
        report('write', error);
      }
    },
    removeItem(name) {
      try {
        const result = storage.removeItem(name);
        if (result instanceof Promise) {
          return result.then(() => {
            markHealthy();
          }).catch((error) => {
            report('remove', error);
          });
        }
        markHealthy();
        return result;
      } catch (error) {
        report('remove', error);
      }
    },
  };
}
