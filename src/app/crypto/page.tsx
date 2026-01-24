'use client';

import { Bitcoin } from 'lucide-react';
import CategoryView from '@/components/CategoryView';

export default function CryptoPage() {
  return (
    <CategoryView
      category="crypto"
      title="Crypto"
      description="Your cryptocurrency holdings including BTC, ETH, stablecoins, and other tokens"
      emptyIcon={<Bitcoin className="w-10 h-10 text-[var(--foreground-muted)]" />}
      emptyMessage="Add crypto positions manually or connect a wallet to track your holdings."
    />
  );
}
