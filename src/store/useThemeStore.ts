import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const getInitialTheme = (): Theme => {
    const savedTheme = localStorage.getItem('forge_theme') as Theme;
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };

  const initialTheme = getInitialTheme();

  return {
    theme: initialTheme,
    toggleTheme: () => set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('forge_theme', newTheme);
      return { theme: newTheme };
    }),
    setTheme: (theme) => {
      localStorage.setItem('forge_theme', theme);
      set({ theme });
    }
  };
});
