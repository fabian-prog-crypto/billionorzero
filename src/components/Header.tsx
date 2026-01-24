'use client';

import { RefreshCw } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  title: string;
  onSync?: () => void;
}

// DeBank API cost constants
const UNITS_PER_WALLET = 18;
const COST_PER_UNIT = 0.0002; // $0.0002 per unit ($200 / 1M units)

export default function Header({ title, onSync }: HeaderProps) {
  const { lastRefresh, isRefreshing, wallets } = usePortfolioStore();

  const lastRefreshText = lastRefresh
    ? `Updated ${formatDistanceToNow(new Date(lastRefresh))} ago`
    : 'Not synced yet';

  // Calculate estimated sync cost
  const walletCount = wallets.length;
  const estimatedUnits = walletCount * UNITS_PER_WALLET;
  const estimatedCostPerSync = estimatedUnits * COST_PER_UNIT;
  const estimatedMonthlyCost = estimatedCostPerSync * 30; // Once per day

  // Build tooltip text
  const costTooltip = walletCount > 0
    ? `Per sync: ${estimatedUnits} units (~$${estimatedCostPerSync.toFixed(4)})\nEst. monthly: ~$${estimatedMonthlyCost.toFixed(2)} (1x/day)`
    : 'Add wallets to track sync costs';

  return (
    <header className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--foreground-muted)]">
          {lastRefreshText}
        </span>
        <div className="relative group">
          <button
            onClick={onSync}
            disabled={isRefreshing}
            className="sync-btn"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          <div className="tooltip">
            {walletCount > 0 ? (
              <>
                <div>Per sync: {estimatedUnits} units (~${estimatedCostPerSync.toFixed(4)})</div>
                <div>Est. monthly: ~${estimatedMonthlyCost.toFixed(2)} (1x/day)</div>
              </>
            ) : (
              <div>Add wallets to track sync costs</div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
