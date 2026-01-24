/**
 * Wallet Data Provider
 * Abstracts wallet data fetching with fallback to demo data
 * Includes caching to reduce API calls during debugging
 */

import { WalletBalance, DefiPosition, Position, Wallet } from '@/types';
import { getDebankApiClient, ApiError } from '../api';
import { generateDemoWalletTokens, generateDemoDefiPositions } from './demo-data';
import { getPerpExchangeService } from '../domain/perp-exchange-service';
import { getCached, setCache, clearAllCache, formatCacheAge } from '../utils/cache';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface WalletProviderConfig {
  debankApiKey?: string;
  useDemoData?: boolean;
  cacheTtlMs?: number; // Cache TTL in milliseconds (default 5 min)
}

export interface WalletTokensResult {
  tokens: WalletBalance[];
  isDemo: boolean;
  error?: string;
}

export interface WalletProtocolsResult {
  positions: DefiPosition[];
  isDemo: boolean;
  error?: string;
}

export class WalletProvider {
  private config: WalletProviderConfig;

  constructor(config: WalletProviderConfig = {}) {
    this.config = config;
  }

  updateConfig(config: Partial<WalletProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Fetch wallet tokens with caching and automatic fallback to demo data
   */
  async getWalletTokens(address: string, forceRefresh: boolean = false): Promise<WalletTokensResult> {
    // If explicitly using demo data or no API key
    if (this.config.useDemoData || !this.config.debankApiKey) {
      console.info('WalletProvider: Using demo data (no API key configured)');
      return {
        tokens: generateDemoWalletTokens(address),
        isDemo: true,
      };
    }

    // Check cache first (unless force refresh)
    const cacheKey = `tokens_${address.toLowerCase()}`;
    if (!forceRefresh) {
      const cached = getCached<WalletTokensResult>(cacheKey);
      if (cached) {
        console.log(`[CACHE] Using cached tokens for ${address.slice(0, 8)}... (${formatCacheAge(cached.age)})`);
        return cached.data;
      }
    }

    try {
      const client = getDebankApiClient(this.config.debankApiKey);
      const rawTokens = await client.getWalletTokens(address);

      // Transform API response to WalletBalance with filtering
      // The DeBank token_list endpoint (without is_all=true) returns ONLY wallet tokens,
      // NOT protocol receipt tokens (aTokens, LP tokens, Pendle PTs). Those come from protocols API.
      // Strategy:
      // 1. Exclude scam/suspicious tokens
      // 2. Skip tiny dust balances (for priced tokens)
      // 3. Include everything else - DeBank's token_list already filters to legitimate tokens
      const tokens: WalletBalance[] = rawTokens
        .filter((token) => {
          // Must have a positive amount
          if (token.amount <= 0) return false;

          // Exclude if explicitly marked as scam/suspicious
          if (token.is_scam === true || token.is_suspicious === true) return false;

          // Calculate value for filtering decisions
          const value = token.amount * (token.price || 0);

          // Skip dust (less than $0.01) for priced tokens
          // But keep tokens with no price (like SYRUP) - they might get price from CoinGecko
          if (token.price > 0 && value < 0.01) return false;

          return true;
        })
        .map((token) => ({
          symbol: token.symbol,
          name: token.name,
          amount: token.amount,
          price: token.price,
          value: token.amount * token.price,
          chain: token.chain,
          logo: token.logo_url,
          isVerified: token.is_verified,
        }))
        .sort((a, b) => b.value - a.value);

      const result = { tokens, isDemo: false };

      // Cache the result
      const ttl = this.config.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
      setCache(cacheKey, result, ttl);
      console.log(`[CACHE] Cached ${tokens.length} tokens for ${address.slice(0, 8)}...`);

      return result;
    } catch (error) {
      console.error('WalletProvider: API error, falling back to demo data', error);

      return {
        tokens: generateDemoWalletTokens(address),
        isDemo: true,
        error: error instanceof ApiError ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch DeFi protocol positions with caching and automatic fallback
   */
  async getWalletProtocols(address: string, forceRefresh: boolean = false): Promise<WalletProtocolsResult> {
    if (this.config.useDemoData || !this.config.debankApiKey) {
      return {
        positions: generateDemoDefiPositions(address),
        isDemo: true,
      };
    }

    // Check cache first (unless force refresh)
    const cacheKey = `protocols_${address.toLowerCase()}`;
    if (!forceRefresh) {
      const cached = getCached<WalletProtocolsResult>(cacheKey);
      if (cached) {
        console.log(`[CACHE] Using cached protocols for ${address.slice(0, 8)}... (${formatCacheAge(cached.age)})`);
        return cached.data;
      }
    }

    try {
      const client = getDebankApiClient(this.config.debankApiKey);
      const rawProtocols = await client.getWalletProtocols(address);

      const positions: DefiPosition[] = [];

      for (const protocol of rawProtocols) {
        // Aggregate all tokens across portfolio items at the protocol level
        // This prevents duplicates when there are multiple positions in the same protocol
        const aggregatedSupply = new Map<string, { symbol: string; amount: number; price: number }>();
        const aggregatedDebt = new Map<string, { symbol: string; amount: number; price: number }>();
        let totalValue = 0;

        for (const item of protocol.portfolio_item_list || []) {
          totalValue += item.stats?.net_usd_value || 0;

          // Aggregate supply tokens
          for (const t of item.detail?.supply_token_list || []) {
            const key = t.symbol.toLowerCase();
            const existing = aggregatedSupply.get(key);
            if (existing) {
              existing.amount += t.amount;
            } else {
              aggregatedSupply.set(key, { symbol: t.symbol, amount: t.amount, price: t.price });
            }
          }

          // Aggregate debt tokens
          for (const t of item.detail?.borrow_token_list || []) {
            const key = t.symbol.toLowerCase();
            const existing = aggregatedDebt.get(key);
            if (existing) {
              existing.amount += t.amount;
            } else {
              aggregatedDebt.set(key, { symbol: t.symbol, amount: t.amount, price: t.price });
            }
          }
        }

        const tokens = Array.from(aggregatedSupply.values());
        const debtTokens = Array.from(aggregatedDebt.values());

        if (tokens.length > 0 || debtTokens.length > 0) {
          positions.push({
            protocol: protocol.name,
            chain: protocol.chain,
            type: 'DeFi', // Generic type since we aggregated
            value: totalValue,
            tokens,
            debtTokens: debtTokens.length > 0 ? debtTokens : undefined,
          });
        }
      }

      const result = {
        positions: positions.sort((a, b) => b.value - a.value),
        isDemo: false,
      };

      // Cache the result
      const ttl = this.config.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
      setCache(cacheKey, result, ttl);
      console.log(`[CACHE] Cached ${positions.length} protocols for ${address.slice(0, 8)}...`);

      return result;
    } catch (error) {
      console.error('WalletProvider: Protocol API error, falling back to demo', error);

      return {
        positions: generateDemoDefiPositions(address),
        isDemo: true,
        error: error instanceof ApiError ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch all wallet positions for multiple wallets
   * Converts wallet tokens to Position objects for the portfolio
   * Also returns prices from DeBank (more accurate for wallet tokens)
   * Includes DeFi protocol positions (supply + debt)
   *
   * IMPORTANT: Protocol positions are processed FIRST to avoid double counting.
   * Tokens that appear in protocol positions (e.g., PT tokens in Pendle) are
   * excluded from the regular token list to prevent counting the same asset twice.
   *
   * @param wallets - Wallets to fetch positions for
   * @param forceRefresh - If true, bypass cache and fetch fresh data
   */
  async fetchAllWalletPositions(wallets: Wallet[], forceRefresh: boolean = false): Promise<{
    positions: Position[];
    prices: Record<string, { price: number; symbol: string }>;
  }> {
    if (wallets.length === 0) return { positions: [], prices: {} };

    if (forceRefresh) {
      console.log('[CACHE] Force refresh requested - bypassing cache');
    }

    const allPositions: Position[] = [];
    const debankPrices: Record<string, { price: number; symbol: string }> = {};

    for (const wallet of wallets) {
      // Track tokens that come from protocols to avoid double counting
      // Use multiple keys for robust matching:
      // - "symbol-chain" for exact match
      // - "symbol" for fallback (handles chain ID differences)
      const protocolTokenKeysByChain = new Set<string>();
      const protocolTokenSymbols = new Set<string>(); // Track just symbols for fallback

      // FIRST: Fetch DeFi protocol positions (including debt)
      // This must happen before regular tokens to track what's in protocols
      const { positions: protocolPositions } = await this.getWalletProtocols(wallet.address, forceRefresh);

      // Track seen position IDs to avoid duplicates within protocols
      const seenPositionIds = new Set<string>();

      for (const defiPos of protocolPositions) {
        // Add supply tokens (collateral, lending, staking, LP)
        for (const token of defiPos.tokens) {
          // Skip tokens with zero amount, but allow price=0 (pre-market, new tokens)
          if (token.amount <= 0) continue;

          // Track this token as coming from a protocol (for dedup against wallet tokens)
          const tokenKey = `${token.symbol.toLowerCase()}-${defiPos.chain}`;
          protocolTokenKeysByChain.add(tokenKey);
          protocolTokenSymbols.add(token.symbol.toLowerCase());

          // Use protocol + type + symbol for unique ID
          const positionId = `${wallet.id}-${defiPos.protocol}-${defiPos.type}-${token.symbol}-supply`;

          // Skip if we've already seen this position (aggregate instead)
          if (seenPositionIds.has(positionId)) {
            const existing = allPositions.find(p => p.id === positionId);
            if (existing) {
              existing.amount += token.amount;
            }
            continue;
          }
          seenPositionIds.add(positionId);

          const priceKey = `debank-${token.symbol.toLowerCase()}-${defiPos.chain}`;
          debankPrices[priceKey] = {
            price: token.price,
            symbol: token.symbol,
          };

          allPositions.push({
            id: positionId,
            type: 'crypto' as const,
            symbol: token.symbol,
            name: `${token.symbol} (${defiPos.protocol})`,
            amount: token.amount,
            walletAddress: wallet.address,
            chain: defiPos.chain,
            protocol: defiPos.protocol,
            debankPriceKey: priceKey,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        // Add debt tokens (borrowed positions)
        // NOTE: Debt tokens should NOT be added to protocolTokenKeys because:
        // - Borrowed tokens are liabilities, not assets you hold
        // - You might have regular holdings of the same token (e.g., hold USDC + borrow USDC)
        // - Only supply tokens should prevent duplicate counting from wallet token list
        if (defiPos.debtTokens) {
          for (const token of defiPos.debtTokens) {
            // Skip tokens with zero amount, but allow price=0 (pre-market, new tokens)
            if (token.amount <= 0) continue;

            // Use protocol + type + symbol for unique ID
            const positionId = `${wallet.id}-${defiPos.protocol}-${defiPos.type}-${token.symbol}-debt`;

            // Skip if we've already seen this position (aggregate instead)
            if (seenPositionIds.has(positionId)) {
              const existing = allPositions.find(p => p.id === positionId);
              if (existing) {
                existing.amount += token.amount;
              }
              continue;
            }
            seenPositionIds.add(positionId);

            const priceKey = `debank-${token.symbol.toLowerCase()}-${defiPos.chain}`;
            debankPrices[priceKey] = {
              price: token.price,
              symbol: token.symbol,
            };

            allPositions.push({
              id: positionId,
              type: 'crypto' as const,
              symbol: token.symbol,
              name: `${token.symbol} Debt (${defiPos.protocol})`,
              amount: token.amount,
              walletAddress: wallet.address,
              chain: defiPos.chain,
              protocol: defiPos.protocol,
              isDebt: true,
              debankPriceKey: priceKey,
              addedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      // SECOND: Fetch regular wallet tokens, excluding those already in protocols
      const { tokens } = await this.getWalletTokens(wallet.address, forceRefresh);

      const walletPositions = tokens
        .filter((token) => {
          // Skip tokens that are already tracked via protocol positions
          // This prevents double counting of tokens deposited in DeFi protocols
          const tokenKey = `${token.symbol.toLowerCase()}-${token.chain}`;
          const symbolOnly = token.symbol.toLowerCase();

          // First check exact chain match
          if (protocolTokenKeysByChain.has(tokenKey)) {
            console.log(`[DEDUP] Skipping ${token.symbol} on ${token.chain} - already in protocol position (exact match)`);
            return false;
          }

          // Fallback: check if symbol is in protocols on any chain
          // This handles cases where chain IDs differ between tokens and protocols APIs
          // But be careful: only skip if it's NOT a major token that could legitimately exist in both places
          // (e.g., user could have USDC in Aave AND separate USDC in wallet)
          // Skip this fallback for common tokens that might legitimately exist separately
          const commonTokens = new Set(['usdc', 'usdt', 'dai', 'weth', 'wbtc', 'eth', 'btc', 'frax', 'lusd']);
          if (!commonTokens.has(symbolOnly) && protocolTokenSymbols.has(symbolOnly)) {
            console.log(`[DEDUP] Skipping ${token.symbol} on ${token.chain} - already in protocol position (symbol match)`);
            return false;
          }

          return true;
        })
        .map((token, index) => {
          // Store the price from DeBank
          const priceKey = `debank-${token.symbol.toLowerCase()}-${token.chain}`;
          debankPrices[priceKey] = {
            price: token.price,
            symbol: token.symbol,
          };

          return {
            id: `${wallet.id}-${token.symbol}-${index}`,
            type: 'crypto' as const,
            symbol: token.symbol,
            name: token.name,
            amount: token.amount,
            walletAddress: wallet.address,
            chain: token.chain,
            debankPriceKey: priceKey,
            addedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });

      allPositions.push(...walletPositions);

      // THIRD: Fetch perp exchange positions via PerpExchangeService
      // Only fetches from exchanges explicitly enabled for this wallet
      const perpService = getPerpExchangeService();
      if (perpService.hasEnabledExchanges(wallet)) {
        const perpResult = await perpService.fetchPositions(wallet);
        allPositions.push(...perpResult.positions);
        Object.assign(debankPrices, perpResult.prices);
      }
    }

    return { positions: allPositions, prices: debankPrices };
  }
}

// Singleton instance
let instance: WalletProvider | null = null;

export function getWalletProvider(config?: WalletProviderConfig): WalletProvider {
  if (!instance) {
    instance = new WalletProvider(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}

/**
 * Clear all wallet data cache
 * Useful for debugging or forcing fresh data
 */
export function clearWalletCache(): void {
  clearAllCache();
}
