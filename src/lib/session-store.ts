// Stateless HMAC-signed session tokens
// Works identically in Edge Runtime (middleware) and Node.js Runtime (API routes)
// Token format: <timestamp>.<base64url-signature>

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET = new TextEncoder().encode('billionorzero-local-session');

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', SECRET, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  return `${timestamp}.${toBase64Url(sig)}`;
}

export async function validateToken(token: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Check expiry
  const createdAt = parseInt(timestamp, 10);
  if (isNaN(createdAt)) return false;
  if (Date.now() - createdAt > SESSION_EXPIRY_MS) return false;

  // Verify HMAC signature
  const key = await getKey();
  const sigBytes = fromBase64Url(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes as ArrayBufferView<ArrayBuffer>, new TextEncoder().encode(timestamp));
}

export function revokeToken(_token: string): void {
  // No-op for stateless tokens — client clears localStorage on logout
}
