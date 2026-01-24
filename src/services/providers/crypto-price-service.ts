/**
 * Crypto Price Service - Single Source of Truth for All Crypto Prices
 *
 * Uses CoinGecko as the centralized pricing source for:
 * - Wallet positions (enriched with 24h changes)
 * - CEX positions (Binance, etc.)
 * - Manual crypto positions
 *
 * DeBank prices are used for wallet token values (more accurate for specific tokens),
 * but CoinGecko is used for 24h change data and as fallback.
 */

import { PriceData, Position } from '@/types';
import { getCoinGeckoApiClient } from '../api';
import { DEMO_CRYPTO_PRICES } from './demo-data';

// Symbol to CoinGecko ID mapping - comprehensive list
const COIN_ID_MAP: Record<string, string> = {
  // Major coins
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
  atom: 'cosmos',
  ltc: 'litecoin',
  avax: 'avalanche-2',
  arb: 'arbitrum',
  op: 'optimism',
  apt: 'aptos',
  sui: 'sui',
  sei: 'sei-network',
  inj: 'injective-protocol',
  near: 'near',
  xlm: 'stellar',
  trx: 'tron',
  etc: 'ethereum-classic',
  xmr: 'monero',
  fil: 'filecoin',
  hbar: 'hedera-hashgraph',
  icp: 'internet-computer',
  vet: 'vechain',
  algo: 'algorand',
  ftm: 'fantom',
  egld: 'elrond-erd-2',
  theta: 'theta-token',
  xtz: 'tezos',
  eos: 'eos',
  neo: 'neo',
  kcs: 'kucoin-shares',
  okb: 'okb',
  // Wrapped tokens
  wbtc: 'wrapped-bitcoin',
  steth: 'staked-ether',
  wsteth: 'wrapped-steth',
  weth: 'weth',
  reth: 'rocket-pool-eth',
  cbeth: 'coinbase-wrapped-staked-eth',
  // DeFi tokens
  mkr: 'maker',
  crv: 'curve-dao-token',
  ldo: 'lido-dao',
  snx: 'havven',
  comp: 'compound-governance-token',
  sushi: 'sushi',
  '1inch': '1inch',
  ens: 'ethereum-name-service',
  grt: 'the-graph',
  // Stablecoins
  dai: 'dai',
  frax: 'frax',
  lusd: 'liquity-usd',
  usdd: 'usdd',
  tusd: 'true-usd',
  gusd: 'gemini-dollar',
  busd: 'binance-usd',
  pyusd: 'paypal-usd',
  fdusd: 'first-digital-usd',
  // Meme coins
  pepe: 'pepe',
  shib: 'shiba-inu',
  wif: 'dogwifcoin',
  bonk: 'bonk',
  floki: 'floki',
  // New L1s and L2s
  tia: 'celestia',
  manta: 'manta-network',
  strk: 'starknet',
  blur: 'blur',
  zk: 'zksync',
  // Solana ecosystem
  jup: 'jupiter-exchange-solana',
  jto: 'jito-governance-token',
  pyth: 'pyth-network',
  ray: 'raydium',
  orca: 'orca',
  // BNB Chain ecosystem
  cake: 'pancakeswap-token',
  syrup: 'syrup', // Maple Finance rebranded to Syrup - CoinGecko ID is 'syrup'
  xvs: 'venus',
  alpaca: 'alpaca-finance',
  // AI tokens
  fet: 'fetch-ai',
  agix: 'singularitynet',
  ocean: 'ocean-protocol',
  rndr: 'render-token',
  // Gaming/Metaverse
  axs: 'axie-infinity',
  sand: 'the-sandbox',
  mana: 'decentraland',
  imx: 'immutable-x',
  gala: 'gala',
  enj: 'enjincoin',
  // Other popular tokens
  wld: 'worldcoin-wld',
  pendle: 'pendle',
  rune: 'thorchain',
  gmx: 'gmx',
  dydx: 'dydx-chain',
  zro: 'layerzero',
  ena: 'ethena',
  ethfi: 'ether-fi',
  eigen: 'eigenlayer',
};

export interface CryptoPriceServiceConfig {
  useDemoData?: boolean;
}

export interface CryptoPriceResult {
  prices: Record<string, PriceData>;
  isDemo: boolean;
}

/**
 * Centralized Crypto Price Service
 * Single source of truth for all cryptocurrency prices
 */
export class CryptoPriceService {
  private config: CryptoPriceServiceConfig;
  private cache: Map<string, { data: PriceData; timestamp: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 minute cache

  constructor(config: CryptoPriceServiceConfig = {}) {
    this.config = config;
  }

  updateConfig(config: Partial<CryptoPriceServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Convert symbol to CoinGecko ID
   */
  getCoinId(symbol: string): string {
    const normalized = symbol.toLowerCase().trim();
    return COIN_ID_MAP[normalized] || normalized;
  }

  /**
   * Check if a symbol has a known CoinGecko mapping
   */
  hasKnownMapping(symbol: string): boolean {
    const normalized = symbol.toLowerCase().trim();
    return normalized in COIN_ID_MAP;
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
   * Fetch prices for multiple coin IDs from CoinGecko
   */
  async getPrices(coinIds: string[]): Promise<Record<string, PriceData>> {
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
      return { ...result, ...this.getDemoPrices(uncachedIds) };
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
      console.error('CryptoPriceService: CoinGecko error, using demo prices', error);
      return { ...result, ...this.getDemoPrices(uncachedIds) };
    }
  }

  /**
   * Fetch prices for crypto positions
   * This is the main entry point for getting prices for any crypto position
   */
  async getPricesForPositions(positions: Position[]): Promise<CryptoPriceResult> {
    const cryptoPositions = positions.filter((p) => p.type === 'crypto');

    if (cryptoPositions.length === 0) {
      return { prices: {}, isDemo: false };
    }

    // Get unique coin IDs
    const coinIds = [...new Set(cryptoPositions.map((p) => this.getCoinId(p.symbol)))];

    const prices = await this.getPrices(coinIds);

    return {
      prices,
      isDemo: this.config.useDemoData || false,
    };
  }

  /**
   * Get demo prices for testing/fallback
   */
  private getDemoPrices(coinIds: string[]): Record<string, PriceData> {
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
   * Clear the price cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let instance: CryptoPriceService | null = null;

export function getCryptoPriceService(config?: CryptoPriceServiceConfig): CryptoPriceService {
  if (!instance) {
    instance = new CryptoPriceService(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

/**
 * Search for cryptocurrencies on CoinGecko
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
