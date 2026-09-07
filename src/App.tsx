/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { Layout } from './layouts/Layout';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Brain from './pages/Brain';
import Workout from './pages/Workout';
import Proposals from './pages/Proposals';
import AuditLogs from './pages/AuditLogs';
import Progress from './pages/Progress';
import Plans from './pages/Plans';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import { getUserProfile } from './lib/api';

/** Only allow onboarding if the user is logged in and has not finished it yet */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      if (localStorage.getItem(`forge_onboarded_${user.uid}`) === 'true') {
        if (!cancelled) {
          setAlreadyDone(true);
          setChecking(false);
        }
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        if (!cancelled) {
          setAlreadyDone(Boolean(profile?.onboardingCompleted));
          setChecking(false);
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm font-medium">
        Loading FORGE Brain...
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (alreadyDone) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  
  useEffect(() => {
    if (!user) {
      setOnboardingChecked(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      // Fast path: localStorage flag
      if (typeof window !== 'undefined' && localStorage.getItem(`forge_onboarded_${user.uid}`) === 'true') {
        if (!cancelled) {
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
        }
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        const done = Boolean(profile?.onboardingCompleted);
        if (done && typeof window !== 'undefined') {
          localStorage.setItem(`forge_onboarded_${user.uid}`, 'true');
        }
        if (!cancelled) {
          setNeedsOnboarding(!done);
          setOnboardingChecked(true);
        }
      } catch {
        // If profile fetch fails, don't block the user forever
        if (!cancelled) {
          setNeedsOnboarding(false);
          setOnboardingChecked(true);
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || (user && !onboardingChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm font-medium">
        Loading FORGE Brain...
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const { theme } = useThemeStore();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={
            <OnboardingGuard>
              <Onboarding />
            </OnboardingGuard>
          } />
          
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="workout" element={<Workout />} />
            <Route path="brain" element={<Brain />} />
            <Route path="proposals" element={<Proposals />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="progress" element={<Progress />} />
            <Route path="plans" element={<Plans />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
