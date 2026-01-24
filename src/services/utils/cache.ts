/**
 * Simple localStorage cache with TTL
 * Useful for debugging to avoid frequent API calls
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const CACHE_PREFIX = 'portfolio_cache_';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached data if valid
 */
export function getCached<T>(key: string): { data: T; age: number } | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();

    if (now > entry.expiresAt) {
      // Cache expired
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return {
      data: entry.data,
      age: now - entry.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Store data in cache with TTL
 */
export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (typeof window === 'undefined') return;

  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

/**
 * Clear specific cache entry
 */
export function clearCache(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_PREFIX + key);
}

/**
 * Clear all portfolio cache entries
 */
export function clearAllCache(): void {
  if (typeof window === 'undefined') return;

  const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
  console.log(`[CACHE] Cleared ${keys.length} cache entries`);
}

/**
 * Get cache age in human readable format
 */
export function formatCacheAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Get all cache info for debugging
 */
export function getCacheInfo(): { key: string; age: string; size: number }[] {
  if (typeof window === 'undefined') return [];

  const info: { key: string; age: string; size: number }[] = [];
  const now = Date.now();

  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(fullKey => {
      try {
        const raw = localStorage.getItem(fullKey);
        if (!raw) return;
        const entry = JSON.parse(raw);
        const key = fullKey.replace(CACHE_PREFIX, '');
        info.push({
          key,
          age: formatCacheAge(now - entry.timestamp),
          size: raw.length,
        });
      } catch {
        // Skip invalid entries
      }
    });

  return info;
}
