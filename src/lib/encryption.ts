/**
 * Encryption Service using Web Crypto API
 * Provides AES-GCM encryption for localStorage data
 * Key is derived from passkey authentication
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

// Storage keys
const ENCRYPTED_MASTER_KEY_STORAGE = 'encrypted_master_key';
const MASTER_KEY_SALT_STORAGE = 'master_key_salt';

/**
 * Generate a random encryption key
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key from passkey material (credentialId + challenge response)
 * This creates a deterministic key from the passkey authentication
 */
export async function deriveKeyFromPasskey(
  credentialId: ArrayBuffer,
  authenticatorData: ArrayBuffer
): Promise<CryptoKey> {
  // Combine credential ID and authenticator data as key material
  const combined = new Uint8Array(credentialId.byteLength + authenticatorData.byteLength);
  combined.set(new Uint8Array(credentialId), 0);
  combined.set(new Uint8Array(authenticatorData), credentialId.byteLength);

  // Import as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    combined,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Get or create salt
  let salt = getSalt();
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    localStorage.setItem(MASTER_KEY_SALT_STORAGE, arrayBufferToBase64(salt));
  }

  // Derive the wrapping key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Get stored salt or return null
 */
function getSalt(): Uint8Array | null {
  const stored = localStorage.getItem(MASTER_KEY_SALT_STORAGE);
  if (!stored) return null;
  return base64ToArrayBuffer(stored);
}

/**
 * Wrap (encrypt) the master key with the passkey-derived key
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrappingKey,
    { name: ALGORITHM, iv }
  );

  // Combine IV + wrapped key for storage
  const combined = new Uint8Array(iv.length + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Unwrap (decrypt) the master key with the passkey-derived key
 */
export async function unwrapMasterKey(
  wrappedKey: string,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> {
  const combined = base64ToArrayBuffer(wrappedKey);
  const iv = combined.slice(0, IV_LENGTH);
  const wrapped = combined.slice(IV_LENGTH);

  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    unwrappingKey,
    { name: ALGORITHM, iv },
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with the master key
 */
export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt data with the master key
 */
export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = base64ToArrayBuffer(encryptedData);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Store the wrapped master key
 */
export function storeWrappedMasterKey(wrappedKey: string): void {
  localStorage.setItem(ENCRYPTED_MASTER_KEY_STORAGE, wrappedKey);
}

/**
 * Get the stored wrapped master key
 */
export function getStoredWrappedMasterKey(): string | null {
  return localStorage.getItem(ENCRYPTED_MASTER_KEY_STORAGE);
}

/**
 * Check if encryption is set up
 */
export function isEncryptionSetUp(): boolean {
  return localStorage.getItem(ENCRYPTED_MASTER_KEY_STORAGE) !== null;
}

/**
 * Clear all encryption data (for reset)
 */
export function clearEncryptionData(): void {
  localStorage.removeItem(ENCRYPTED_MASTER_KEY_STORAGE);
  localStorage.removeItem(MASTER_KEY_SALT_STORAGE);
}

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// In-memory master key (only available after successful authentication)
let masterKey: CryptoKey | null = null;

/**
 * Set the master key in memory (call after successful passkey auth)
 */
export function setMasterKey(key: CryptoKey): void {
  masterKey = key;
}

/**
 * Get the master key from memory
 */
export function getMasterKey(): CryptoKey | null {
  return masterKey;
}

/**
 * Clear the master key from memory (call on logout)
 */
export function clearMasterKey(): void {
  masterKey = null;
}

/**
 * Check if master key is available (user is authenticated)
 */
export function isMasterKeyAvailable(): boolean {
  return masterKey !== null;
}
