import { create } from 'zustand';
import { User } from 'firebase/auth';
import { getOrCreateGuestIdentity } from '../lib/guest-session';

export interface ForgeUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  isDemo?: boolean;
  isGuest?: boolean;
  getIdToken?: (forceRefresh?: boolean) => Promise<string>;
}

export function createGuestUser(): ForgeUser {
  const identity = getOrCreateGuestIdentity();
  return {
    uid: identity.uid,
    displayName: identity.displayName,
    email: null,
    photoURL: null,
    isAnonymous: true,
    isGuest: true,
  };
}

interface AuthState {
  user: User | ForgeUser | null;
  loading: boolean;
  setUser: (user: User | ForgeUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));

