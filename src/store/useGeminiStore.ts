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
  const storedKey = localStorage.getItem('FORGE_GEMINI_API_KEY');
  
  return {
    apiKey: storedKey,
    status: storedKey ? 'CONNECTED' : 'UNCONFIGURED',
    isModalOpen: false,
    
    setApiKey: (key) => {
      if (key) {
        localStorage.setItem('FORGE_GEMINI_API_KEY', key);
        set({ apiKey: key, status: 'CONNECTED' });
      } else {
        localStorage.removeItem('FORGE_GEMINI_API_KEY');
        set({ apiKey: null, status: 'UNCONFIGURED' });
      }
    },
    
    setStatus: (status) => set({ status }),
    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),
  };
});
