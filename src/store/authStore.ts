import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  isPasskeyEnabled: boolean;
  setAuthenticated: (value: boolean) => void;
  setPasskeyEnabled: (value: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isPasskeyEnabled: false,

  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setPasskeyEnabled: (value) => set({ isPasskeyEnabled: value }),

  logout: () => set({ isAuthenticated: false }),
}));
