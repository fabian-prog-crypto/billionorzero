'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function WalletIdRedirect() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    router.replace(`/crypto/wallets/${params.id}`);
  }, [router, params.id]);

  return null;
}
