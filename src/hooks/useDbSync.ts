'use client';

import { useEffect, useRef } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';

const DEBOUNCE_MS = 2_000;

/**
 * Auto-sync hook: subscribes to Zustand store changes and
 * POSTs the state to /api/portfolio/sync after a 2-second debounce.
 * This keeps db.json in sync with the client-side store so CMD-K
 * queries and mutations see the latest data.
 *
 * Mount once in PortfolioProvider.
 */
export function useDbSync() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = usePortfolioStore.subscribe((state) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const payload = {
          positions: state.positions,
          accounts: state.accounts,
          prices: state.prices,
          customPrices: state.customPrices,
          fxRates: state.fxRates,
          transactions: state.transactions,
          snapshots: state.snapshots,
          lastRefresh: state.lastRefresh,
          hideBalances: state.hideBalances,
          hideDust: state.hideDust,
          riskFreeRate: state.riskFreeRate,
        };

        fetch('/api/portfolio/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {
          // Silently ignore sync failures — not critical path
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
