'use client';

import { useEffect, useRef } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';

const DEBOUNCE_MS = 5_000;
const STORE_VERSION = 10;

/**
 * Auto-backup hook: subscribes to Zustand store changes and
 * POSTs the partialized state to /api/backup after a 5-second debounce.
 *
 * Mount once in PortfolioProvider.
 */
export function useAutoBackup() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = usePortfolioStore.subscribe((state) => {
      // Clear any pending backup
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const payload = {
          storeVersion: STORE_VERSION,
          backupDate: new Date().toISOString(),
          positions: state.positions,
          accounts: state.accounts,
          prices: state.prices,
          customPrices: state.customPrices,
          transactions: state.transactions,
          snapshots: state.snapshots,
          lastRefresh: state.lastRefresh,
          hideBalances: state.hideBalances,
          hideDust: state.hideDust,
          riskFreeRate: state.riskFreeRate,
        };

        fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {
          // Silently ignore backup failures — this is a safety net, not critical path
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
