/**
 * Encrypted Storage Adapter for Zustand
 * Provides encrypted localStorage persistence using the master encryption key
 */

import { StateStorage } from 'zustand/middleware';
import {
  encrypt,
  decrypt,
  getMasterKey,
  isMasterKeyAvailable,
} from './encryption';

// Prefix for encrypted storage keys
const ENCRYPTED_PREFIX = 'enc_';

// In-memory cache for decrypted data (used during session)
const decryptedCache = new Map<string, string>();

/**
 * Create an encrypted storage adapter for Zustand persist middleware
 * Falls back to regular localStorage when encryption is not available
 */
export function createEncryptedStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      // Check in-memory cache first
      if (decryptedCache.has(name)) {
        return decryptedCache.get(name) || null;
      }

      // Try to get encrypted data
      const encryptedKey = ENCRYPTED_PREFIX + name;
      const encryptedData = localStorage.getItem(encryptedKey);

      if (encryptedData && isMasterKeyAvailable()) {
        try {
          const masterKey = getMasterKey();
          if (masterKey) {
            const decrypted = await decrypt(encryptedData, masterKey);
            decryptedCache.set(name, decrypted);
            return decrypted;
          }
        } catch (error) {
          console.error('[EncryptedStorage] Failed to decrypt data:', error);
          // Fall through to try unencrypted
        }
      }

      // Fall back to unencrypted data (for migration or when encryption not set up)
      const unencryptedData = localStorage.getItem(name);
      if (unencryptedData) {
        decryptedCache.set(name, unencryptedData);
      }
      return unencryptedData;
    },

    setItem: async (name: string, value: string): Promise<void> => {
      // Always update the cache
      decryptedCache.set(name, value);

      if (isMasterKeyAvailable()) {
        try {
          const masterKey = getMasterKey();
          if (masterKey) {
            const encryptedData = await encrypt(value, masterKey);
            const encryptedKey = ENCRYPTED_PREFIX + name;
            localStorage.setItem(encryptedKey, encryptedData);

            // Remove unencrypted version if it exists (migration)
            if (localStorage.getItem(name)) {
              localStorage.removeItem(name);
            }
            return;
          }
        } catch (error) {
          console.error('[EncryptedStorage] Failed to encrypt data:', error);
          // Fall through to unencrypted storage
        }
      }

      // Fall back to unencrypted storage
      localStorage.setItem(name, value);
    },

    removeItem: async (name: string): Promise<void> => {
      decryptedCache.delete(name);
      localStorage.removeItem(name);
      localStorage.removeItem(ENCRYPTED_PREFIX + name);
    },
  };
}

/**
 * Clear the in-memory decrypted cache (call on logout)
 */
export function clearDecryptedCache(): void {
  decryptedCache.clear();
}

/**
 * Migrate unencrypted data to encrypted storage
 * Call this after successful passkey authentication/registration
 */
export async function migrateToEncryptedStorage(storageKeys: string[]): Promise<void> {
  if (!isMasterKeyAvailable()) {
    console.warn('[EncryptedStorage] Cannot migrate - master key not available');
    return;
  }

  const masterKey = getMasterKey();
  if (!masterKey) return;

  for (const name of storageKeys) {
    const encryptedKey = ENCRYPTED_PREFIX + name;

    // Skip if already encrypted
    if (localStorage.getItem(encryptedKey)) {
      continue;
    }

    // Get unencrypted data
    const unencryptedData = localStorage.getItem(name);
    if (!unencryptedData) {
      continue;
    }

    try {
      // Encrypt and store
      const encryptedData = await encrypt(unencryptedData, masterKey);
      localStorage.setItem(encryptedKey, encryptedData);

      // Remove unencrypted version
      localStorage.removeItem(name);

      console.log(`[EncryptedStorage] Migrated ${name} to encrypted storage`);
    } catch (error) {
      console.error(`[EncryptedStorage] Failed to migrate ${name}:`, error);
    }
  }
}

/**
 * Check if data for a key is encrypted
 */
export function isDataEncrypted(name: string): boolean {
  return localStorage.getItem(ENCRYPTED_PREFIX + name) !== null;
}
