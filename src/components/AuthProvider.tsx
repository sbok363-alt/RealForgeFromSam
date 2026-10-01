import React, { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore, createGuestUser } from '../store/useAuthStore';
import { GUEST_SESSION_KEY, setGuestSessionActive } from '../lib/guest-session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Real authenticated user overrides any local guest session.
        setGuestSessionActive(false);
        localStorage.removeItem('forge_demo_session');
        setUser(user);
      } else {
        const legacyDemo = typeof window !== 'undefined' && localStorage.getItem('forge_demo_session') === 'true';
        const isGuest = typeof window !== 'undefined' &&
          (localStorage.getItem(GUEST_SESSION_KEY) === 'true' || legacyDemo);
        if (isGuest) {
          localStorage.removeItem('forge_demo_session');
          setGuestSessionActive(true);
          setUser(createGuestUser());
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <>{children}</>;
}

