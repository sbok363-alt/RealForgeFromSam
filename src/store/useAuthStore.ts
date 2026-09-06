import { create } from 'zustand';
import { User } from 'firebase/auth';

export interface ForgeUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  isDemo?: boolean;
  getIdToken?: (forceRefresh?: boolean) => Promise<string>;
}

export const DEMO_USER: ForgeUser = {
  uid: 'demo-athlete-forge',
  displayName: 'Alex Rivers (Demo)',
  email: 'athlete@forge.local',
  photoURL: null,
  isDemo: true,
  getIdToken: async () => 'demo-token',
};

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

