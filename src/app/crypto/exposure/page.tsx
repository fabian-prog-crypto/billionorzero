'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CryptoExposureRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/exposure');
  }, [router]);

  return null;
}
