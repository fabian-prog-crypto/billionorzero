'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PerpsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/crypto/perps');
  }, [router]);

  return null;
}
