'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { isPasskeyRegistered } from '@/lib/passkey';
import LoginScreen from './LoginScreen';

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const {
    isAuthenticated,
    _hasHydrated,
    setAuthenticated,
    setPasskeyEnabled
  } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return;

    // Check if passkey is registered
    const hasPasskey = isPasskeyRegistered();
    setPasskeyEnabled(hasPasskey);

    // If no passkey is set up and not already authenticated, auto-authenticate (first time user)
    if (!hasPasskey && !isAuthenticated) {
      setAuthenticated(true);
    }
  }, [_hasHydrated, isAuthenticated, setAuthenticated, setPasskeyEnabled]);

  // Show loading state while hydrating from localStorage
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login screen if passkey is enabled but not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Show app content
  return <>{children}</>;
}
