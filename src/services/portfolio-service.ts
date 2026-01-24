/**
 * Portfolio Service - Main Orchestration Service
 * Coordinates all sub-services for portfolio operations
 */

import { Position, Wallet, PriceData } from '@/types';
import { getWalletProvider } from './providers';
import { getPriceProvider } from './providers';
import { getConfigManager, ServiceConfig } from './config';
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
   */
  private updateProviders(): void {
    const config = this.configManager.getConfig();

    getWalletProvider({
      debankApiKey: config.debankApiKey,
      useDemoData: config.useDemoData,
    });

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
   */
  async refreshPortfolio(
    manualPositions: Position[],
    wallets: Wallet[]
  ): Promise<RefreshResult> {
    // Ensure providers have latest config
    this.updateProviders();

    const walletProvider = getWalletProvider();
    const priceProvider = getPriceProvider();

    // Fetch wallet positions - includes prices from DeBank
    const walletResult = await walletProvider.fetchAllWalletPositions(wallets);
    const walletPositions = walletResult.positions;

    // Get unique wallet token symbols to fetch 24h changes from CoinGecko
    const walletCryptoSymbols = [...new Set(
      walletPositions
        .filter(p => p.type === 'crypto')
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

    // Merge prices: DeBank prices take priority for wallet tokens
    const allPrices = { ...externalPrices, ...debankPrices };

    // Debug logging
    console.log('[REFRESH] DeBank prices:', Object.keys(debankPrices).length, 'tokens');
    console.log('[REFRESH] External prices:', Object.keys(externalPrices).length, 'tokens');
    console.log('[REFRESH] Wallet positions:', walletPositions.length);

    // Log sample of prices with 24h change
    for (const [key, data] of Object.entries(debankPrices).slice(0, 5)) {
      console.log(`  [PRICE] ${key}: $${data.price} (${data.changePercent24h.toFixed(2)}%)`);
    }

    return {
      prices: allPrices,
      walletPositions,
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
