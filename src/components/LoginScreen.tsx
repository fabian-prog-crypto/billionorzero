'use client';

import { useState, useEffect, useRef } from 'react';
import { Fingerprint, KeyRound, AlertCircle, Shield, Zap, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/components/ui/Logo';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  registerPasskey,
  authenticateWithPasskey,
} from '@/lib/passkey';

const TAGLINES = [
  'Track your portfolio.',
  'Aim for a billion.',
  'Accept the zero.',
];

function TypewriterText() {
  const [displayText, setDisplayText] = useState('');
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const currentTagline = TAGLINES[taglineIndex];

    if (isPaused) {
      const pauseTimer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 2000);
      return () => clearTimeout(pauseTimer);
    }

    if (isDeleting) {
      if (displayText === '') {
        setIsDeleting(false);
        setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
        return;
      }
      const timer = setTimeout(() => {
        setDisplayText(displayText.slice(0, -1));
      }, 30);
      return () => clearTimeout(timer);
    }

    if (displayText === currentTagline) {
      setIsPaused(true);
      return;
    }

    const timer = setTimeout(() => {
      setDisplayText(currentTagline.slice(0, displayText.length + 1));
    }, 80);
    return () => clearTimeout(timer);
  }, [displayText, taglineIndex, isDeleting, isPaused]);

  return (
    <span className="inline-block min-w-[1ch]">
      {displayText}
      <span className="cursor-blink text-[var(--accent-primary)]">|</span>
    </span>
  );
}

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);

  const { setAuthenticated, setPasskeyEnabled } = useAuthStore();

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 landing-bg grid-bg overflow-hidden">
      {/* Ambient glow elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--accent-primary)] opacity-[0.03]  blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[var(--accent-primary)] opacity-[0.03] blur-3xl" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        {/* Main content */}
        <div className="w-full max-w-lg">
          {/* Logo & Title */}
          <div
            className="text-center mb-12 opacity-0 animate-fade-in-up"
            style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}
          >
            {/* Logo */}
            <div className="inline-flex mb-8">
              <Logo size={80} className="text-[var(--foreground)] animate-float" />
            </div>

            {/* Title */}
            <h1 className="font-poppins text-5xl md:text-6xl font-bold tracking-tight mb-4">
              <span className="text-gradient">Billion</span>
              <span className="text-[var(--foreground-muted)] font-light mx-2">or</span>
              <span className="text-[var(--foreground)]">Zero</span>
            </h1>

            {/* Typewriter tagline */}
            <p className="font-poppins text-xl md:text-2xl text-[var(--foreground-muted)] font-light h-8">
              <TypewriterText />
            </p>
          </div>

          {/* Auth Card */}
          <div
            className="glass-card p-8 md:p-10 opacity-0 animate-scale-in"
            style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
          >
            {!supported ? (
              <div className="text-center">
                <div className="w-16 h-16  bg-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8 text-[var(--foreground-muted)]" />
                </div>
                <h2 className="font-poppins text-xl font-semibold mb-2">Passkeys not supported</h2>
                <p className="text-[var(--foreground-muted)] mb-8 text-sm">
                  Your browser doesn&apos;t support passkeys. You can still use the app.
                </p>
                <button onClick={handleSkip} className="btn btn-primary w-full">
                  Continue to App
                </button>
              </div>
            ) : hasPasskey ? (
              <div className="text-center">
                <div className="relative inline-flex mb-6">
                  <div className="w-20 h-20  bg-[var(--accent-glow)] flex items-center justify-center">
                    <Fingerprint className="w-10 h-10 text-[var(--accent-primary)]" />
                  </div>
                  <div className="absolute inset-0  animate-glow-pulse opacity-30" />
                </div>
                <h2 className="font-poppins text-2xl font-semibold mb-2">Welcome back</h2>
                <p className="text-[var(--foreground-muted)] mb-8 text-sm">
                  Authenticate with your passkey to unlock
                </p>

                {error && (
                  <div className="mb-6 p-4 bg-[var(--negative-light)] border border-[var(--negative)]/20  text-[var(--negative)] text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={isLoading}
                  className="btn btn-primary w-full h-14 text-base"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white  animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-3">
                      <Fingerprint className="w-5 h-5" />
                      Unlock with Passkey
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="relative inline-flex mb-6">
                  <div className="w-20 h-20  bg-[var(--accent-glow)] flex items-center justify-center">
                    <KeyRound className="w-10 h-10 text-[var(--accent-primary)]" />
                  </div>
                </div>
                <h2 className="font-poppins text-2xl font-semibold mb-2">Get Started</h2>
                <p className="text-[var(--foreground-muted)] mb-8 text-sm leading-relaxed">
                  Secure your portfolio with Face ID, Touch ID, or your device PIN
                </p>

                {error && (
                  <div className="mb-6 p-4 bg-[var(--negative-light)] border border-[var(--negative)]/20  text-[var(--negative)] text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleRegister}
                  disabled={isLoading}
                  className="btn btn-primary w-full h-14 text-base mb-4"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white  animate-spin" />
                      Setting up...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-3">
                      <Shield className="w-5 h-5" />
                      Create Passkey
                    </span>
                  )}
                </button>

                <button
                  onClick={handleSkip}
                  className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>

          {/* Features */}
          <div
            className="mt-12 grid grid-cols-3 gap-6 opacity-0 animate-fade-in"
            style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}
          >
            <div className="text-center">
              <div className="w-10 h-10  bg-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-5 h-5 text-[var(--accent-primary)]" />
              </div>
              <p className="text-xs text-[var(--foreground-muted)]">Real-time Tracking</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10  bg-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-3">
                <Shield className="w-5 h-5 text-[var(--accent-primary)]" />
              </div>
              <p className="text-xs text-[var(--foreground-muted)]">Local & Secure</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10  bg-[var(--background-tertiary)] flex items-center justify-center mx-auto mb-3">
                <Zap className="w-5 h-5 text-[var(--accent-primary)]" />
              </div>
              <p className="text-xs text-[var(--foreground-muted)]">Multi-Chain</p>
            </div>
          </div>

          {/* Footer */}
          <p
            className="text-center text-xs text-[var(--foreground-subtle)] mt-10 opacity-0 animate-fade-in"
            style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}
          >
            Your data stays on this device
          </p>
        </div>
      </div>
    </div>
  );
}
