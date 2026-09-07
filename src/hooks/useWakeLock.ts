import { useEffect, useRef } from 'react';

/**
 * Keeps the screen awake while `active` is true (e.g. during an in-progress workout).
 * Uses the Screen Wake Lock API when available; silently no-ops otherwise.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let released = false;

    const request = async () => {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        if (released) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        lock.addEventListener('release', () => {
          lockRef.current = null;
        });
      } catch {
        // Permission denied / unsupported in this context — ignore
      }
    };

    request();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active && !lockRef.current) {
        request();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
      }
    };
  }, [active]);
}
