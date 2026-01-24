/**
 * Price Provider - Unified Facade for All Price Services
 *
 * Delegates to specialized services:
 * - CryptoPriceService: All cryptocurrency prices (CoinGecko)
 * - StockPriceService: All stock prices (Finnhub)
 *
 * This provider maintains backward compatibility while using
 * the single-source-of-truth architecture underneath.
 */

import { PriceData, Position } from '@/types';
import { getCryptoPriceService, CryptoPriceService } from './crypto-price-service';
import { getStockPriceService, StockPriceService } from './stock-price-service';

// Re-export search functions from services
export { searchCoins, getTopCoins } from './crypto-price-service';
export { searchStocks } from './stock-price-service';

export interface PriceProviderConfig {
  stockApiKey?: string;
  useDemoData?: boolean;
}

export interface PriceResult {
  prices: Record<string, PriceData>;
  isDemo: boolean;
  errors?: string[];
}

/**
 * Unified Price Provider
 * Facade that coordinates crypto and stock price services
 */
export class PriceProvider {
  private cryptoService: CryptoPriceService;
  private stockService: StockPriceService;
  private config: PriceProviderConfig;

  constructor(config: PriceProviderConfig = {}) {
    this.config = config;
    this.cryptoService = getCryptoPriceService({ useDemoData: config.useDemoData });
    this.stockService = getStockPriceService({
      apiKey: config.stockApiKey,
      useDemoData: config.useDemoData,
    });
  }

  updateConfig(config: Partial<PriceProviderConfig>): void {
    this.config = { ...this.config, ...config };
    this.cryptoService.updateConfig({ useDemoData: config.useDemoData });
    this.stockService.updateConfig({
      apiKey: config.stockApiKey,
      useDemoData: config.useDemoData,
    });
  }

  /**
   * Convert symbol to CoinGecko ID
   * Delegates to CryptoPriceService
   */
  getCoinId(symbol: string): string {
    return this.cryptoService.getCoinId(symbol);
  }

  /**
   * Check if a crypto symbol has a known CoinGecko mapping
   */
  hasKnownCryptoMapping(symbol: string): boolean {
    return this.cryptoService.hasKnownMapping(symbol);
  }

  /**
   * Fetch crypto prices from CoinGecko
   * Delegates to CryptoPriceService
   */
  async getCryptoPrices(coinIds: string[]): Promise<Record<string, PriceData>> {
    return this.cryptoService.getPrices(coinIds);
  }

  /**
   * Fetch stock prices from Finnhub
   * Delegates to StockPriceService
   */
  async getStockPrices(symbols: string[]): Promise<Record<string, PriceData>> {
    return this.stockService.getPrices(symbols);
  }

  /**
   * Fetch prices for all positions (crypto and stocks)
   * Main entry point for getting prices for any position type
   */
  async getPricesForPositions(positions: Position[]): Promise<PriceResult> {
    // Separate positions by type
    const cryptoPositions = positions.filter((p) => p.type === 'crypto');
    const stockPositions = positions.filter((p) => p.type === 'stock');

    // Fetch in parallel from specialized services
    const [cryptoResult, stockResult] = await Promise.all([
      this.cryptoService.getPricesForPositions(cryptoPositions),
      this.stockService.getPricesForPositions(stockPositions),
    ]);

    return {
      prices: { ...cryptoResult.prices, ...stockResult.prices },
      isDemo: cryptoResult.isDemo || stockResult.isDemo,
    };
  }

  /**
   * Clear all price caches
   */
  clearCache(): void {
    this.cryptoService.clearCache();
    this.stockService.clearCache();
  }
}

// Singleton instance
let instance: PriceProvider | null = null;

export function getPriceProvider(config?: PriceProviderConfig): PriceProvider {
  if (!instance) {
    instance = new PriceProvider(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}
