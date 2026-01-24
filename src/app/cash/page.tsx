'use client';

import { Banknote } from 'lucide-react';
import CategoryView from '@/components/CategoryView';

export default function CashPage() {
  return (
    <CategoryView
      category="cash"
      title="Cash"
      description="Your cash and cash equivalent holdings in various currencies"
      emptyIcon={<Banknote className="w-10 h-10 text-[var(--foreground-muted)]" />}
      emptyMessage="Add cash positions to track your liquid holdings."
    />
  );
}
