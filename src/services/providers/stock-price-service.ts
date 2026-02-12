/**
 * Stock Price Service - Single Source of Truth for All Stock Prices
 *
 * Uses Finnhub as the pricing source for:
 * - Manual stock positions
 * - ETFs and other equity instruments
 *
 * Completely separate from crypto pricing.
 */

import { PriceData, Position } from '@/types';
import { getStockApiClient } from '../api';
import { DEMO_STOCK_PRICES } from './demo-data';

export interface StockPriceServiceConfig {
  apiKey?: string;
  useDemoData?: boolean;
}

export interface StockPriceResult {
  prices: Record<string, PriceData>;
  isDemo: boolean;
}

/**
 * Centralized Stock Price Service
 * Single source of truth for all stock/equity prices
 */
export class StockPriceService {
  private config: StockPriceServiceConfig;
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 minute cache

  constructor(config: StockPriceServiceConfig = {}) {
    this.config = config;
  }

  updateConfig(config: Partial<StockPriceServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get cached price if valid
   */
  private getCachedPrice(key: string): PriceData | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set price in cache
   */
  private setCachedPrice(key: string, data: PriceData): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch prices for multiple stock symbols from Finnhub
   */
  async getPrices(symbols: string[]): Promise<Record<string, PriceData>> {
    if (symbols.length === 0) return {};

    // Check cache first
    const uncachedSymbols: string[] = [];
    const result: Record<string, PriceData> = {};

    for (const symbol of symbols) {
      const key = symbol.toLowerCase();
      const cached = this.getCachedPrice(`stock-${key}`);
      if (cached) {
        result[key] = cached;
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length === 0) {
      return result;
    }

    // Use demo data if no API key or explicitly configured
    if (this.config.useDemoData || !this.config.apiKey) {
      return { ...result, ...this.getDemoPrices(uncachedSymbols) };
    }

    try {
      const client = getStockApiClient(this.config.apiKey);
      const quotes = await client.getMultipleQuotes(uncachedSymbols);

      for (const [symbol, quote] of quotes.entries()) {
        const key = symbol.toLowerCase();
        const priceData: PriceData = {
          symbol: key,
          price: quote.c,
          change24h: quote.d,
          changePercent24h: quote.dp,
          lastUpdated: new Date().toISOString(),
        };

        this.setCachedPrice(`stock-${key}`, priceData);
        result[key] = priceData;
      }

      return result;
    } catch (error) {
      console.error('StockPriceService: Finnhub error, using demo prices', error);
      return { ...result, ...this.getDemoPrices(uncachedSymbols) };
    }
  }

  /**
   * Fetch prices for stock positions
   * This is the main entry point for getting prices for any stock position
   */
  async getPricesForPositions(positions: Position[]): Promise<StockPriceResult> {
    const stockPositions = positions.filter((p) => p.type === 'stock');

    if (stockPositions.length === 0) {
      return { prices: {}, isDemo: false };
    }

    // Get unique symbols
    const symbols = [...new Set(stockPositions.map((p) => p.symbol.toUpperCase()))];

    const prices = await this.getPrices(symbols);

    return {
      prices,
      isDemo: this.config.useDemoData || !this.config.apiKey || false,
    };
  }

  /**
   * Get demo prices for testing/fallback
   */
  private getDemoPrices(symbols: string[]): Record<string, PriceData> {
    const result: Record<string, PriceData> = {};

    for (const symbol of symbols) {
      const key = symbol.toLowerCase();
      const demo = DEMO_STOCK_PRICES[key];
      if (demo) {
        result[key] = {
          symbol: key,
          price: demo.price,
          change24h: demo.change,
          changePercent24h: demo.changePercent,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    return result;
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let instance: StockPriceService | null = null;

export function getStockPriceService(config?: StockPriceServiceConfig): StockPriceService {
  if (!instance) {
    instance = new StockPriceService(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

const FALLBACK_STOCKS = [
  { symbol: 'AAPL', description: 'Apple Inc.' },
  { symbol: 'GOOGL', description: 'Alphabet Inc.' },
  { symbol: 'MSFT', description: 'Microsoft Corporation' },
  { symbol: 'AMZN', description: 'Amazon.com Inc.' },
  { symbol: 'TSLA', description: 'Tesla Inc.' },
  { symbol: 'NVDA', description: 'NVIDIA Corporation' },
  { symbol: 'META', description: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', description: 'Netflix Inc.' },
  { symbol: 'AMD', description: 'Advanced Micro Devices' },
  { symbol: 'INTC', description: 'Intel Corporation' },
];

/**
 * Search for stocks via Finnhub API with fallback to hardcoded list
 */
export async function searchStocks(query: string): Promise<Array<{ symbol: string; description: string }>> {
  try {
    const client = getStockApiClient();
    const results = await client.searchSymbol(query);
    return results.slice(0, 10).map(r => ({
      symbol: r.symbol,
      description: r.description,
    }));
  } catch {
    // Fallback to hardcoded list when no API key or API error
    const q = query.toLowerCase();
    return FALLBACK_STOCKS.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }
}
