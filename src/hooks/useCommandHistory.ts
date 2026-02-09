'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'command-palette-history';
const MAX_ENTRIES = 10;
const DISPLAY_LIMIT = 5;

interface CommandEntry {
  text: string;
  timestamp: number;
}

function loadEntries(): CommandEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCommandHistory() {
  const [entries, setEntries] = useState<CommandEntry[]>(loadEntries);

  const addCommand = useCallback((text: string) => {
    setEntries(prev => {
      // Remove duplicate if it exists
      const filtered = prev.filter(e => e.text.toLowerCase() !== text.toLowerCase());
      const next = [{ text, timestamp: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  // Return last N for display
  const recentCommands = entries.slice(0, DISPLAY_LIMIT);

  return { recentCommands, addCommand };
}
