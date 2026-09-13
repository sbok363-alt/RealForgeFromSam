import { create } from 'zustand';
import { User } from 'firebase/auth';
import { bindWorkoutIdentity } from './useWorkoutStore';
import { useGeminiStore } from './useGeminiStore';

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
  identityEpoch: number;
  setUser: (user: User | ForgeUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  identityEpoch: 0,
  setUser: (user) => {
    if (get().user?.uid !== user?.uid) {
      useGeminiStore.getState().setApiKey(null);
      useGeminiStore.getState().closeModal();
      bindWorkoutIdentity(user?.uid || null);
      set({ user, identityEpoch: get().identityEpoch + 1 });
    } else set({ user });
  },
  setLoading: (loading) => set({ loading }),
}));

