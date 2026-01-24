'use client';

import { usePortfolioStore } from '@/store/portfolioStore';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { lastRefresh } = usePortfolioStore();

  const lastRefreshText = lastRefresh
    ? `Updated ${formatDistanceToNow(new Date(lastRefresh))} ago`
    : 'Not synced yet';

  return (
    <header className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <span className="text-sm text-[var(--foreground-muted)]">
        {lastRefreshText}
      </span>
    </header>
  );
}
