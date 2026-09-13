import React, { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore, DEMO_USER } from '../store/useAuthStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const identityEpoch = useAuthStore((state) => state.identityEpoch);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Real authenticated user overrides demo session
        localStorage.removeItem('forge_demo_session');
        setUser(user);
      } else {
        const isDemo = typeof window !== 'undefined' && localStorage.getItem('forge_demo_session') === 'true';
        if (isDemo) {
          setUser(DEMO_USER);
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <React.Fragment key={identityEpoch}>{children}</React.Fragment>;
}

