import type { StateStorage } from 'zustand/middleware';

/**
 * Zustand storage adapter that persists to a server-side JSON file
 * via the /api/db route, instead of localStorage.
 */
export const jsonFileStorage: StateStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/db');
      if (!res.ok) return null;
      const data = await res.json();

      // Already in Zustand persist format: {state: {...}, version: N}
      if (data.state && data.version !== undefined) {
        return JSON.stringify(data);
      }

      // Backup/flat format (seeded from current.json): wrap for Zustand.
      // Set version to 12 so the v13 migration runs (recovers wallet addresses).
      if (data.positions || data.accounts) {
        const { storeVersion: _sv, backupDate: _bd, ...state } = data;
        return JSON.stringify({ state, version: 12 });
      }

      return JSON.stringify(data);
    } catch {
      return null;
    }
  },

  setItem: async (_name: string, value: string): Promise<void> => {
    try {
      await fetch('/api/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: value, // Already serialized by Zustand
      });
    } catch {
      // Silently fail — store will retry on next change
    }
  },

  removeItem: async (_name: string): Promise<void> => {
    try {
      await fetch('/api/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch {
      // Silently fail
    }
  },
};
