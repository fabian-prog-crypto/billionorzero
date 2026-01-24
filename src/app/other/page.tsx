'use client';

import { Package } from 'lucide-react';
import CategoryView from '@/components/CategoryView';

export default function OtherPage() {
  return (
    <CategoryView
      category="other"
      title="Other"
      description="Other assets that don't fit into crypto, stocks, or cash categories"
      emptyIcon={<Package className="w-10 h-10 text-[var(--foreground-muted)]" />}
      emptyMessage="Add other asset types to track custom holdings."
    />
  );
}
