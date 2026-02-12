const TOKEN_KEY = 'api-session-token';

/**
 * Returns existing localStorage token if present, otherwise fetches a fresh one.
 */
export async function getOrRefreshToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;

  return refreshToken();
}

/**
 * Always fetches a new token from the server and stores it in localStorage.
 */
export async function refreshToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch('/api/auth/token', { method: 'POST' });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}
