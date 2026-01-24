'use client';

import { TrendingUp } from 'lucide-react';
import CategoryView from '@/components/CategoryView';

export default function StocksPage() {
  return (
    <CategoryView
      category="stocks"
      title="Stocks"
      description="Your equity holdings including tech, AI, and other stock positions"
      emptyIcon={<TrendingUp className="w-10 h-10 text-[var(--foreground-muted)]" />}
      emptyMessage="Add stock positions to track your equity portfolio."
    />
  );
}
