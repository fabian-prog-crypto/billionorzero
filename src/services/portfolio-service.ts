/**
 * Portfolio Service - Main Orchestration Service
 * Coordinates all sub-services for portfolio operations
 */

import { Position, Account, PriceData } from '@/types';
import { getWalletProvider } from './providers';
import { getPriceProvider } from './providers';
import { getConfigManager, ServiceConfig } from './config';
import { getAllFxRates } from './api/fx-api';
import {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
} from './domain';
import {
  createDailySnapshot,
  shouldTakeSnapshot,
} from './domain';

export interface RefreshResult {
  prices: Record<string, PriceData>;
  walletPositions: Position[];
  fxRates: Record<string, number>;
  isDemo: boolean;
  errors?: string[];
}

/**
 * Portfolio Service
 * High-level service that orchestrates wallet and price providers
 */
export class PortfolioService {
  private configManager = getConfigManager();

  /**
   * Initialize the service with current config
   */
  initialize(): void {
    this.configManager.loadFromStorage();
    this.updateProviders();
  }

  /**
   * Update provider configurations from config manager
   * Always reload from localStorage to get the latest API keys
   */
  private updateProviders(): void {
    // Reload config from localStorage to ensure we have the latest API keys
    this.configManager.loadFromStorage();
    const config = this.configManager.getConfig();

    // Debug: Log config state
    console.log('[PortfolioService.updateProviders] Config loaded:', {
      hasDebankKey: !!config.debankApiKey,
      debankKeyLength: config.debankApiKey?.length || 0,
      debankKeyPreview: config.debankApiKey ? config.debankApiKey.slice(0, 8) + '...' : 'NONE',
      hasHeliusKey: !!config.heliusApiKey,
      hasBirdeyeKey: !!config.birdeyeApiKey,
      useDemoData: config.useDemoData,
    });

    const walletProviderConfig = {
      debankApiKey: config.debankApiKey,
      heliusApiKey: config.heliusApiKey,
      birdeyeApiKey: config.birdeyeApiKey,
      useDemoData: config.useDemoData,
    };
    console.log('[PortfolioService.updateProviders] Calling getWalletProvider with:', {
      hasDebankKey: !!walletProviderConfig.debankApiKey,
      hasHeliusKey: !!walletProviderConfig.heliusApiKey,
      hasBirdeyeKey: !!walletProviderConfig.birdeyeApiKey,
      useDemoData: walletProviderConfig.useDemoData,
    });

    getWalletProvider(walletProviderConfig);

    getPriceProvider({
      stockApiKey: config.stockApiKey,
      useDemoData: config.useDemoData,
    });
  }

  /**
   * Refresh all portfolio data
   * - Fetches wallet positions (with DeBank prices)
   * - Fetches current prices for manual positions from CoinGecko/Finnhub
   * - DeBank prices are used for wallet tokens (more accurate)
   * - 24h changes fetched from CoinGecko for all crypto
   *
   * @param manualPositions - Manual positions to fetch prices for
   * @param wallets - Wallets to fetch positions from
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   */
  async refreshPortfolio(
    manualPositions: Position[],
    accounts: Account[],
    forceRefresh: boolean = false
  ): Promise<RefreshResult> {
    console.log('[PortfolioService.refreshPortfolio] Starting with:', {
      manualPositionsCount: manualPositions.length,
      accountsCount: accounts.length,
      forceRefresh,
    });

    // Ensure providers have latest config
    this.updateProviders();

    const walletProvider = getWalletProvider();
    const priceProvider = getPriceProvider();

    console.log('[PortfolioService.refreshPortfolio] Fetching wallet positions...');

    // Fetch wallet positions - includes prices from DeBank
    const walletResult = await walletProvider.fetchAllWalletPositions(accounts, forceRefresh);
    const walletPositions = walletResult.positions;

    console.log('[PortfolioService.refreshPortfolio] Wallet result:', {
      positionsCount: walletPositions.length,
      pricesCount: Object.keys(walletResult.prices).length,
    });

    // Get unique wallet token symbols to fetch 24h changes from CoinGecko
    const walletCryptoSymbols = [...new Set(
      walletPositions
        .filter(p => p.assetClass === 'crypto' || p.type === 'crypto')
        .map(p => p.symbol.toLowerCase())
    )];

    // Fetch 24h changes from CoinGecko for wallet tokens
    const walletCoinIds = walletCryptoSymbols.map(s => priceProvider.getCoinId(s));
    const coingeckoPrices = await priceProvider.getCryptoPrices(walletCoinIds);

    // Convert DeBank prices to PriceData format, enriched with CoinGecko 24h changes
    const debankPrices: Record<string, PriceData> = {};
    for (const [key, data] of Object.entries(walletResult.prices)) {
      // Try to get 24h change from CoinGecko
      const coinId = priceProvider.getCoinId(data.symbol.toLowerCase());
      const cgData = coingeckoPrices[coinId];

      debankPrices[key] = {
        symbol: data.symbol,
        price: data.price, // Use DeBank price (more accurate for specific tokens)
        change24h: cgData ? cgData.change24h : 0,
        changePercent24h: cgData ? cgData.changePercent24h : 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Only fetch prices from CoinGecko/Finnhub for manual positions
    // Wallet positions use DeBank prices which are more accurate
    const { prices: externalPrices, isDemo } = await priceProvider.getPricesForPositions(manualPositions);

    // Fetch FX rates for fiat currency conversion
    const fxRates = await getAllFxRates();
    console.log('[PortfolioService.refreshPortfolio] FX rates fetched:', Object.keys(fxRates).length, 'currencies');

    // Also include CoinGecko prices directly so they can be used as fallback
    // for wallet tokens where DeBank has no price (like SYRUP)
    // These are keyed by CoinGecko ID (e.g., "maple-finance" for SYRUP)
    const allPrices = { ...coingeckoPrices, ...externalPrices, ...debankPrices };

    return {
      prices: allPrices,
      walletPositions,
      fxRates,
      isDemo,
    };
  }

  /**
   * Get configuration manager
   */
  getConfigManager() {
    return this.configManager;
  }

  /**
   * Update API configuration
   */
  updateConfig(updates: Partial<ServiceConfig>): void {
    this.configManager.setConfig(updates);
    this.updateProviders();
  }

  /**
   * Subscribe to config changes
   */
  onConfigChange(callback: (config: ServiceConfig) => void): () => void {
    return this.configManager.subscribe(callback);
  }
}

// Singleton instance
let instance: PortfolioService | null = null;

export function getPortfolioService(): PortfolioService {
  if (!instance) {
    instance = new PortfolioService();
  }
  return instance;
}

// Re-export commonly used functions from domain
export {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
  createDailySnapshot,
  shouldTakeSnapshot,
} from './domain';
