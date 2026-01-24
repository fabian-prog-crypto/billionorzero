/**
 * Passkey (WebAuthn) utilities for local authentication
 */

// Check if WebAuthn is supported
export function isPasskeySupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

// Generate a random challenge
function generateChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface StoredCredential {
  credentialId: string;
  publicKey: string;
  createdAt: string;
}

const CREDENTIAL_STORAGE_KEY = 'passkey-credential';
const RP_NAME = 'Billion or Zero';
const RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

// Get stored credential
export function getStoredCredential(): StoredCredential | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

// Check if passkey is registered
export function isPasskeyRegistered(): boolean {
  return getStoredCredential() !== null;
}

// Register a new passkey
export async function registerPasskey(): Promise<{ success: boolean; error?: string }> {
  if (!isPasskeySupported()) {
    return { success: false, error: 'Passkeys are not supported in this browser' };
  }

  try {
    const challenge = generateChallenge();
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: RP_NAME,
        id: RP_ID,
      },
      user: {
        id: userId,
        name: 'user@billionorzero.local',
        displayName: 'Portfolio Owner',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Failed to create credential' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Store the credential ID and public key
    const storedCredential: StoredCredential = {
      credentialId: arrayBufferToBase64(credential.rawId),
      publicKey: arrayBufferToBase64(response.getPublicKey()!),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCredential));

    return { success: true };
  } catch (error) {
    console.error('Passkey registration error:', error);
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Registration was cancelled or timed out' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error during registration' };
  }
}

// Authenticate with passkey
export async function authenticateWithPasskey(): Promise<{ success: boolean; error?: string }> {
  if (!isPasskeySupported()) {
    return { success: false, error: 'Passkeys are not supported in this browser' };
  }

  const storedCredential = getStoredCredential();
  if (!storedCredential) {
    return { success: false, error: 'No passkey registered' };
  }

  try {
    const challenge = generateChallenge();

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: RP_ID,
      allowCredentials: [
        {
          id: base64ToArrayBuffer(storedCredential.credentialId),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      return { success: false, error: 'Authentication failed' };
    }

    // For client-side only auth, we just verify the credential was used
    // In a real app, you'd verify the signature on the server
    return { success: true };
  } catch (error) {
    console.error('Passkey authentication error:', error);
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication was cancelled or timed out' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error during authentication' };
  }
}

// Remove stored passkey
export function removePasskey(): void {
  localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
}
