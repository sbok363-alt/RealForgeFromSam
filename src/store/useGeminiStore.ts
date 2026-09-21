import { create } from 'zustand';

type GeminiKeyStatus = 'UNCONFIGURED' | 'TESTING' | 'CONNECTED' | 'ERROR';

interface GeminiStore {
  apiKey: string | null;
  status: GeminiKeyStatus;
  isModalOpen: boolean;
  setApiKey: (key: string | null) => void;
  setStatus: (status: GeminiKeyStatus) => void;
  openModal: () => void;
  closeModal: () => void;
}

// Purge any legacy plaintext key persisted in localStorage
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('FORGE_GEMINI_API_KEY');
  } catch (_) {}
}

const getInitialSessionKey = (): string | null => {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    return sessionStorage.getItem('FORGE_GEMINI_API_KEY');
  } catch (_) {
    return null;
  }
};

export const useGeminiStore = create<GeminiStore>((set) => {
  const sessionKey = getInitialSessionKey();
  
  return {
    apiKey: sessionKey,
    status: sessionKey ? 'CONNECTED' : 'UNCONFIGURED',
    isModalOpen: false,
    
    setApiKey: (key) => {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          if (key) {
            sessionStorage.setItem('FORGE_GEMINI_API_KEY', key);
          } else {
            sessionStorage.removeItem('FORGE_GEMINI_API_KEY');
          }
        } catch (_) {}
      }
      if (key) {
        set({ apiKey: key, status: 'CONNECTED' });
      } else {
        set({ apiKey: null, status: 'UNCONFIGURED' });
      }
    },
    
    setStatus: (status) => set({ status }),
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),
  };
});
