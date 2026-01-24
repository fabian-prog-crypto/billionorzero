'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { isPasskeyRegistered } from '@/lib/passkey';
import LoginScreen from './LoginScreen';

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, setAuthenticated, setPasskeyEnabled } = useAuthStore();

  useEffect(() => {
    // Check if passkey is registered
    const hasPasskey = isPasskeyRegistered();
    setPasskeyEnabled(hasPasskey);

    // If no passkey is set up, auto-authenticate (first time user)
    if (!hasPasskey) {
      setAuthenticated(true);
    }

    setIsLoading(false);
  }, [setAuthenticated, setPasskeyEnabled]);

  // Show loading state
  if (isLoading) {
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
