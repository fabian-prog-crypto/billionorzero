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
import type { Position, PriceData } from '@/types';

const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours (once per day)

// Shared refresh state to prevent concurrent refreshes across provider and hook
const refreshState = {
  isRefreshing: false,
  lastSnapshotDate: null as string | null,
};

/**
 * Core refresh logic - shared between PortfolioProvider and useRefresh hook
 * @param forceRefresh - If true, bypass cache and fetch fresh data
 */
async function executeRefresh(forceRefresh: boolean = false): Promise<void> {
  console.log('[executeRefresh] Starting refresh, forceRefresh:', forceRefresh);

  if (refreshState.isRefreshing) {
    console.log('[executeRefresh] Already refreshing, skipping');
    return;
  }
  refreshState.isRefreshing = true;

  const store = usePortfolioStore.getState();
  store.setRefreshing(true);

  console.log('[executeRefresh] Store state:', {
    walletsCount: store.wallets.length,
    walletAddresses: store.wallets.map(w => w.address?.slice(0, 10) + '...'),
    positionsCount: store.positions.length,
    accountsCount: store.accounts.length,
  });

  try {
    const portfolioService = getPortfolioService();

    // Get only manual positions (non-wallet, non-CEX positions)
    const manualPositions = store.positions.filter(
      (p) => !p.walletAddress && !p.protocol?.startsWith('cex:')
    );

    console.log('[executeRefresh] Calling portfolioService.refreshPortfolio with', store.wallets.length, 'wallets');

    // Use the portfolio service to refresh wallets and prices
    const result = await portfolioService.refreshPortfolio(
      manualPositions,
      store.wallets,
      forceRefresh
    );

    console.log('[executeRefresh] Result:', {
      walletPositionsCount: result.walletPositions.length,
      pricesCount: Object.keys(result.prices).length,
      isDemo: result.isDemo,
    });

    // Fetch CEX account positions
    let cexPositions: Position[] = [];
    let cexPrices: Record<string, PriceData> = {};
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

    // Take daily snapshot if needed (once per day)
    const today = new Date().toISOString().split('T')[0];
    const latestStore = usePortfolioStore.getState();
    if (refreshState.lastSnapshotDate !== today && shouldTakeSnapshot(latestStore.snapshots)) {
      const allPositions = [...manualPositions, ...result.walletPositions, ...cexPositions];
      const allPrices = { ...latestStore.prices, ...result.prices, ...cexPrices };
      const snapshot = createDailySnapshot(allPositions, allPrices);
      latestStore.addSnapshot(snapshot);
      refreshState.lastSnapshotDate = today;
    }
  } catch (error) {
    console.error('Error refreshing portfolio:', error);
  } finally {
    usePortfolioStore.getState().setRefreshing(false);
    refreshState.isRefreshing = false;
  }
}

interface PortfolioProviderProps {
  children: React.ReactNode;
}

export default function PortfolioProvider({ children }: PortfolioProviderProps) {
  // Initialize service on mount and reset any stuck refresh state
  useEffect(() => {
    getPortfolioService().initialize();

    // Reset any stuck refresh state from previous session
    const store = usePortfolioStore.getState();
    if (store.isRefreshing) {
      console.log('[PortfolioProvider] Resetting stuck refresh state');
      store.setRefreshing(false);
    }
    refreshState.isRefreshing = false;
  }, []);

  // Auto-sync disabled to save API calls
  // Users must manually click refresh button to sync
  // Uncomment the code below to re-enable auto-sync:
  //
  // // Initial refresh on mount
  // useEffect(() => {
  //   const store = usePortfolioStore.getState();
  //   const hasData = store.positions.length > 0 || store.wallets.length > 0 || store.accounts.length > 0;
  //   if (hasData) {
  //     executeRefresh(false);
  //   }
  // }, []);
  //
  // // Auto-refresh interval
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const store = usePortfolioStore.getState();
  //     const hasData = store.positions.length > 0 || store.wallets.length > 0 || store.accounts.length > 0;
  //     if (hasData) {
  //       executeRefresh(false);
  //     }
  //   }, REFRESH_INTERVAL);
  //
  //   return () => clearInterval(interval);
  // }, []);

  return <>{children}</>;
}

/**
 * Hook to trigger manual refresh and access refresh state
 */
export function useRefresh() {
  const isRefreshing = usePortfolioStore((state) => state.isRefreshing);

  // Manual refresh always forces cache bypass
  const refresh = useCallback(() => executeRefresh(true), []);

  return { refresh, isRefreshing };
}
