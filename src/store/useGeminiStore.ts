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

export const useGeminiStore = create<GeminiStore>((set) => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('FORGE_GEMINI_API_KEY');
  }
  return {
    apiKey: null,
    status: 'UNCONFIGURED',
    isModalOpen: false,
    
    setApiKey: (key) => {
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
