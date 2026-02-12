import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Session expires after 30 days (in milliseconds)
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface AuthState {
  isAuthenticated: boolean;
  isPasskeyEnabled: boolean;
  loginTimestamp: number | null;
  _hasHydrated: boolean;
  setAuthenticated: (value: boolean) => void;
  setPasskeyEnabled: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isPasskeyEnabled: false,
      loginTimestamp: null,
      _hasHydrated: false,

      setAuthenticated: (value) => {
        set({
          isAuthenticated: value,
          loginTimestamp: value ? Date.now() : null,
        });
        if (value) {
          fetch('/api/auth/token', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
              if (data.token) {
                localStorage.setItem('api-session-token', data.token);
              }
            })
            .catch(() => {});
        }
      },
      setPasskeyEnabled: (value) => set({ isPasskeyEnabled: value }),
      setHasHydrated: (value) => set({ _hasHydrated: value }),

      logout: () => {
        const token = localStorage.getItem('api-session-token');
        if (token) {
          fetch('/api/auth/token', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
          localStorage.removeItem('api-session-token');
        }
        set({
          isAuthenticated: false,
          loginTimestamp: null,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Check if session has expired
          if (state.isAuthenticated && state.loginTimestamp) {
            const elapsed = Date.now() - state.loginTimestamp;
            if (elapsed > SESSION_EXPIRY_MS) {
              // Session expired, log out
              state.isAuthenticated = false;
              state.loginTimestamp = null;
            }
          }
          // Refresh server-side token for returning users (handles server restart)
          if (state.isAuthenticated) {
            fetch('/api/auth/token', { method: 'POST' })
              .then(res => res.json())
              .then(data => {
                if (data.token) localStorage.setItem('api-session-token', data.token);
              })
              .catch(() => {});
          }
          state._hasHydrated = true;
        }
      },
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        isPasskeyEnabled: state.isPasskeyEnabled,
        loginTimestamp: state.loginTimestamp,
      }),
    }
  )
);
