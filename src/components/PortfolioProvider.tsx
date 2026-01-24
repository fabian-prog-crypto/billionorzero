'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  getPortfolioService,
  createDailySnapshot,
  shouldTakeSnapshot,
  fetchAllCexPositions,
  getPriceProvider,
} from '@/services';

const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours (once per day)

interface PortfolioProviderProps {
  children: React.ReactNode;
}

export default function PortfolioProvider({ children }: PortfolioProviderProps) {
  const lastSnapshotCheck = useRef<string | null>(null);
  const portfolioService = useRef(getPortfolioService());
  const isRefreshingRef = useRef(false);

  // Initialize service on mount
  useEffect(() => {
    portfolioService.current.initialize();
  }, []);

  const doRefresh = useCallback(async () => {
    // Use ref to prevent concurrent refreshes without depending on store state
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    const store = usePortfolioStore.getState();
    store.setRefreshing(true);

    try {
      // Get only manual positions (non-wallet, non-CEX positions)
      const manualPositions = store.positions.filter(
        (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
      );

      // Use the portfolio service to refresh wallets and prices
      const result = await portfolioService.current.refreshPortfolio(
        manualPositions,
        store.wallets
      );

      // Also fetch CEX account positions
      let cexPositions: typeof result.walletPositions = [];
      let cexPrices: Record<string, import('@/types').PriceData> = {};
      if (store.accounts.length > 0) {
        try {
          cexPositions = await fetchAllCexPositions(store.accounts);
          // Fetch prices for CEX positions from CoinGecko
          if (cexPositions.length > 0) {
            const priceProvider = getPriceProvider();
            const { prices } = await priceProvider.getPricesForPositions(cexPositions);
            cexPrices = prices;
          }
        } catch (error) {
          console.error('Error fetching CEX positions:', error);
        }
      }

      // Get fresh state for updates
      const currentStore = usePortfolioStore.getState();

      // Update prices in store (including CEX prices from CoinGecko)
      currentStore.setPrices({ ...currentStore.prices, ...result.prices, ...cexPrices });

      // Update wallet positions in store
      if (result.walletPositions.length > 0) {
        currentStore.setWalletPositions(result.walletPositions);
      }

      // Update CEX positions in store
      if (cexPositions.length > 0) {
        currentStore.setAccountPositions(cexPositions);
      }

      currentStore.setLastRefresh(new Date().toISOString());

      // Take daily snapshot if needed
      const today = new Date().toISOString().split('T')[0];
      const latestStore = usePortfolioStore.getState();
      if (lastSnapshotCheck.current !== today && shouldTakeSnapshot(latestStore.snapshots)) {
        const allPositions = [...manualPositions, ...result.walletPositions, ...cexPositions];
        const allPrices = { ...latestStore.prices, ...result.prices };
        const snapshot = createDailySnapshot(allPositions, allPrices);
        latestStore.addSnapshot(snapshot);
        lastSnapshotCheck.current = today;
      }
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
    } finally {
      usePortfolioStore.getState().setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, []);

  // Initial refresh on mount
  useEffect(() => {
    const store = usePortfolioStore.getState();
    const hasData = store.positions.length > 0 || store.wallets.length > 0 || store.accounts.length > 0;
    if (hasData) {
      doRefresh();
    }
  }, [doRefresh]);

  // Auto-refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      const store = usePortfolioStore.getState();
      const hasData = store.positions.length > 0 || store.wallets.length > 0 || store.accounts.length > 0;
      if (hasData) {
        doRefresh();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [doRefresh]);

  return <>{children}</>;
}

/**
 * Hook to trigger manual refresh and access refresh state
 * @param forceRefresh - If true, bypass cache and fetch fresh data (default: true for manual refresh)
 */
export function useRefresh() {
  const isRefreshing = usePortfolioStore((state) => state.isRefreshing);
  const portfolioService = useRef(getPortfolioService());
  const isRefreshingRef = useRef(false);

  const refreshWithForce = useCallback(async (forceRefresh: boolean = true) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    const store = usePortfolioStore.getState();
    store.setRefreshing(true);

    try {
      // Get only manual positions (non-wallet, non-CEX)
      const manualPositions = store.positions.filter(
        (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
      );

      // Use the portfolio service (forceRefresh=true bypasses cache)
      const result = await portfolioService.current.refreshPortfolio(
        manualPositions,
        store.wallets,
        forceRefresh
      );

      // Also fetch CEX account positions
      let cexPositions: typeof result.walletPositions = [];
      let cexPrices: Record<string, import('@/types').PriceData> = {};
      if (store.accounts.length > 0) {
        try {
          cexPositions = await fetchAllCexPositions(store.accounts);
          // Fetch prices for CEX positions from CoinGecko
          if (cexPositions.length > 0) {
            const priceProvider = getPriceProvider();
            const { prices } = await priceProvider.getPricesForPositions(cexPositions);
            cexPrices = prices;
          }
        } catch (error) {
          console.error('Error fetching CEX positions:', error);
        }
      }

      // Get fresh state
      const currentStore = usePortfolioStore.getState();

      // Update store (including CEX prices from CoinGecko)
      currentStore.setPrices({ ...currentStore.prices, ...result.prices, ...cexPrices });

      if (result.walletPositions.length > 0) {
        currentStore.setWalletPositions(result.walletPositions);
      }

      if (cexPositions.length > 0) {
        currentStore.setAccountPositions(cexPositions);
      }

      currentStore.setLastRefresh(new Date().toISOString());

      // Snapshot check
      const latestStore = usePortfolioStore.getState();
      if (shouldTakeSnapshot(latestStore.snapshots)) {
        const allPositions = [...manualPositions, ...result.walletPositions, ...cexPositions];
        const snapshot = createDailySnapshot(allPositions, {
          ...latestStore.prices,
          ...result.prices,
        });
        latestStore.addSnapshot(snapshot);
      }
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
    } finally {
      usePortfolioStore.getState().setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, []);

  // onClick-compatible wrapper that forces refresh
  const refresh = useCallback(() => refreshWithForce(true), [refreshWithForce]);

  return { refresh, isRefreshing };
}
