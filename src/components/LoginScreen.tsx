'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, KeyRound, Coins, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  registerPasskey,
  authenticateWithPasskey,
} from '@/lib/passkey';

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [supported, setSupported] = useState(true);

  const { setAuthenticated, setPasskeyEnabled } = useAuthStore();

  useEffect(() => {
    // Check passkey support and registration status
    const checkPasskey = () => {
      const isSupported = isPasskeySupported();
      setSupported(isSupported);

      if (isSupported) {
        const registered = isPasskeyRegistered();
        setHasPasskey(registered);
        setPasskeyEnabled(registered);
      }
    };

    checkPasskey();
  }, [setPasskeyEnabled]);

  const handleRegister = async () => {
    setIsLoading(true);
    setError(null);

    const result = await registerPasskey();

    if (result.success) {
      setHasPasskey(true);
      setPasskeyEnabled(true);
      setAuthenticated(true);
    } else {
      setError(result.error || 'Registration failed');
    }

    setIsLoading(false);
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    const result = await authenticateWithPasskey();

    if (result.success) {
      setAuthenticated(true);
    } else {
      setError(result.error || 'Authentication failed');
    }

    setIsLoading(false);
  };

  const handleSkip = () => {
    setAuthenticated(true);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent-primary)] rounded-2xl mb-4">
            <Coins className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Billion or Zero</h1>
          <p className="text-[var(--foreground-muted)] mt-1">
            Track your portfolio to the moon
          </p>
        </div>

        {/* Login Card */}
        <div className="card">
          {!supported ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-3" />
              <p className="text-[var(--foreground-muted)] mb-4">
                Passkeys are not supported in this browser.
              </p>
              <button onClick={handleSkip} className="btn btn-primary w-full">
                Continue without passkey
              </button>
            </div>
          ) : hasPasskey ? (
            /* Login with existing passkey */
            <div className="text-center">
              <Fingerprint className="w-16 h-16 text-[var(--accent-primary)] mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Welcome back</h2>
              <p className="text-[var(--foreground-muted)] mb-6">
                Use your passkey to unlock your portfolio
              </p>

              {error && (
                <div className="mb-4 p-3 bg-[var(--negative-light)] text-[var(--negative)] rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="btn btn-primary w-full mb-3"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Fingerprint className="w-4 h-4" />
                    Unlock with Passkey
                  </span>
                )}
              </button>
            </div>
          ) : (
            /* Setup new passkey */
            <div className="text-center">
              <KeyRound className="w-16 h-16 text-[var(--accent-primary)] mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Secure your portfolio</h2>
              <p className="text-[var(--foreground-muted)] mb-6">
                Set up a passkey to protect your data with Face ID, Touch ID, or your device PIN
              </p>

              {error && (
                <div className="mb-4 p-3 bg-[var(--negative-light)] text-[var(--negative)] rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleRegister}
                disabled={isLoading}
                className="btn btn-primary w-full mb-3"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting up...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Fingerprint className="w-4 h-4" />
                    Create Passkey
                  </span>
                )}
              </button>

              <button
                onClick={handleSkip}
                className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--foreground-muted)] mt-6">
          Your data is stored locally on this device
        </p>
      </div>
    </div>
  );
}
