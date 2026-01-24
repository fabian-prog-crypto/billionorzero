/**
 * Price Data Provider
 * Abstracts price fetching for crypto and stocks with caching and fallbacks
 */

import { PriceData, Position } from '@/types';
import { getCoinGeckoApiClient, getStockApiClient, ApiError } from '../api';
import { DEMO_CRYPTO_PRICES, DEMO_STOCK_PRICES } from './demo-data';

// Common symbol to CoinGecko ID mapping
const COIN_ID_MAP: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  usdt: 'tether',
  usdc: 'usd-coin',
  bnb: 'binancecoin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  sol: 'solana',
  dot: 'polkadot',
  matic: 'matic-network',
  pol: 'matic-network',
  link: 'chainlink',
  uni: 'uniswap',
  aave: 'aave',
  wbtc: 'wrapped-bitcoin',
  steth: 'staked-ether',
  wsteth: 'wrapped-steth',
  weth: 'weth',
  dai: 'dai',
  atom: 'cosmos',
  ltc: 'litecoin',
  avax: 'avalanche-2',
  arb: 'arbitrum',
  op: 'optimism',
  mkr: 'maker',
  crv: 'curve-dao-token',
  ldo: 'lido-dao',
  snx: 'havven',
  comp: 'compound-governance-token',
  sushi: 'sushi',
  '1inch': '1inch',
  ens: 'ethereum-name-service',
  grt: 'the-graph',
  pepe: 'pepe',
  shib: 'shiba-inu',
  apt: 'aptos',
  sui: 'sui',
  sei: 'sei-network',
  inj: 'injective-protocol',
  reth: 'rocket-pool-eth',
  cbeth: 'coinbase-wrapped-staked-eth',
  frax: 'frax',
  lusd: 'liquity-usd',
  usdd: 'usdd',
  tusd: 'true-usd',
  gusd: 'gemini-dollar',
  busd: 'binance-usd',
  pyusd: 'paypal-usd',
};

export interface PriceProviderConfig {
  stockApiKey?: string;
  useDemoData?: boolean;
}

export interface PriceResult {
  prices: Record<string, PriceData>;
  isDemo: boolean;
  errors?: string[];
}

export class PriceProvider {
  private config: PriceProviderConfig;
  private priceCache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 minute cache

  constructor(config: PriceProviderConfig = {}) {
    this.config = config;
  }

  updateConfig(config: Partial<PriceProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Convert symbol to CoinGecko ID
   */
  getCoinId(symbol: string): string {
    const normalized = symbol.toLowerCase();
    return COIN_ID_MAP[normalized] || normalized;
  }

  /**
   * Get cached price if valid
   */
  private getCachedPrice(key: string): PriceData | null {
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set price in cache
   */
  private setCachedPrice(key: string, data: PriceData): void {
    this.priceCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Fetch crypto prices from CoinGecko
   */
  async getCryptoPrices(coinIds: string[]): Promise<Record<string, PriceData>> {
    if (coinIds.length === 0) return {};

    // Check cache first
    const uncachedIds: string[] = [];
    const result: Record<string, PriceData> = {};

    for (const id of coinIds) {
      const cached = this.getCachedPrice(id);
      if (cached) {
        result[id] = cached;
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      return result;
    }

    // Use demo data if configured
    if (this.config.useDemoData) {
      return this.getDemoCryptoPrices(coinIds);
    }

    try {
      const client = getCoinGeckoApiClient();
      const response = await client.getPrices(uncachedIds);

      for (const [coinId, data] of Object.entries(response)) {
        const priceData: PriceData = {
          symbol: coinId,
          price: data.usd,
          change24h: data.usd * (data.usd_24h_change || 0) / 100,
          changePercent24h: data.usd_24h_change || 0,
          lastUpdated: new Date().toISOString(),
        };

        this.setCachedPrice(coinId, priceData);
        result[coinId] = priceData;
      }

      return result;
    } catch (error) {
      console.error('PriceProvider: CoinGecko error, using demo prices', error);
      return this.getDemoCryptoPrices(coinIds);
    }
  }

  /**
   * Get demo crypto prices
   */
  private getDemoCryptoPrices(coinIds: string[]): Record<string, PriceData> {
    const result: Record<string, PriceData> = {};

    for (const id of coinIds) {
      const demo = DEMO_CRYPTO_PRICES[id];
      if (demo) {
        result[id] = {
          symbol: id,
          price: demo.price,
          change24h: demo.price * demo.change24h / 100,
          changePercent24h: demo.change24h,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    return result;
  }

  /**
   * Fetch stock prices from Finnhub
   */
  async getStockPrices(symbols: string[]): Promise<Record<string, PriceData>> {
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
    if (this.config.useDemoData || !this.config.stockApiKey) {
      return this.getDemoStockPrices(symbols);
    }

    try {
      const client = getStockApiClient(this.config.stockApiKey);
      const quotes = await client.getMultipleQuotes(uncachedSymbols);

      for (const [symbol, quote] of quotes.entries()) {
        const priceData: PriceData = {
          symbol: symbol,
          price: quote.c,
          change24h: quote.d,
          changePercent24h: quote.dp,
          lastUpdated: new Date().toISOString(),
        };

        this.setCachedPrice(`stock-${symbol}`, priceData);
        result[symbol] = priceData;
      }

      return result;
    } catch (error) {
      console.error('PriceProvider: Finnhub error, using demo prices', error);
      return this.getDemoStockPrices(symbols);
    }
  }

  /**
   * Get demo stock prices
   */
  private getDemoStockPrices(symbols: string[]): Record<string, PriceData> {
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
   * Fetch prices for all positions (crypto and stocks)
   */
  async getPricesForPositions(positions: Position[]): Promise<PriceResult> {
    const cryptoPositions = positions.filter((p) => p.type === 'crypto');
    const stockPositions = positions.filter((p) => p.type === 'stock');

    // Get unique IDs/symbols
    const cryptoIds = [...new Set(cryptoPositions.map((p) => this.getCoinId(p.symbol)))];
    const stockSymbols = [...new Set(stockPositions.map((p) => p.symbol.toUpperCase()))];

    // Fetch in parallel
    const [cryptoPrices, stockPrices] = await Promise.all([
      this.getCryptoPrices(cryptoIds),
      this.getStockPrices(stockSymbols),
    ]);

    return {
      prices: { ...cryptoPrices, ...stockPrices },
      isDemo: this.config.useDemoData || false,
    };
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.priceCache.clear();
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

/**
 * Search for cryptocurrencies
 */
export async function searchCoins(query: string): Promise<any[]> {
  try {
    const client = getCoinGeckoApiClient();
    const results = await client.searchCoin(query);
    return results.slice(0, 10).map((coin) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      market_cap_rank: coin.market_cap_rank,
    }));
  } catch (error) {
    console.error('Error searching coins:', error);
    return [];
  }
}

/**
 * Get top cryptocurrencies (for suggestions)
 */
export function getTopCoins(): any[] {
  return [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'eth' },
    { id: 'solana', name: 'Solana', symbol: 'sol' },
    { id: 'cardano', name: 'Cardano', symbol: 'ada' },
    { id: 'ripple', name: 'XRP', symbol: 'xrp' },
    { id: 'polkadot', name: 'Polkadot', symbol: 'dot' },
    { id: 'chainlink', name: 'Chainlink', symbol: 'link' },
    { id: 'uniswap', name: 'Uniswap', symbol: 'uni' },
  ];
}

/**
 * Search for stocks (demo implementation)
 */
export function searchStocks(query: string): any[] {
  const allStocks = [
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

  const q = query.toLowerCase();
  return allStocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );
}
