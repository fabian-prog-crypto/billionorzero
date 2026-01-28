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

// Spam token detection patterns - uses partial matching
// If token symbol or name CONTAINS any of these strings (case-insensitive), it's blocked
const SPAM_TOKEN_PATTERNS = [
  'squid',        // SQUID Game token (rug pull) - matches "SQUID", "SQUID2", "SquidGame"
  'safemoon',     // Known scam token
  'shibaswap',    // Fake token impersonating ShibaSwap
  'airdrop',      // Common in spam token names
  'visit',        // Spam tokens often have "visit xyz.com" in name
  '.com',         // Spam tokens advertising websites
  '.io/',         // Spam tokens advertising websites (with slash to avoid legitimate tokens)
  '.xyz',         // Spam tokens advertising websites
  'claim',        // "Claim your..." spam tokens
];

/**
 * Check if a token symbol or name matches spam patterns
 * Uses partial matching for better spam detection
 */
function isSpamToken(symbol: string, name?: string): boolean {
  const symbolLower = symbol.toLowerCase();
  const nameLower = (name || '').toLowerCase();

  return SPAM_TOKEN_PATTERNS.some(pattern =>
    symbolLower.includes(pattern) || nameLower.includes(pattern)
  );
}


export interface WalletProviderConfig {
  debankApiKey?: string;
  heliusApiKey?: string; // For Solana wallets
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
   * Check if an address is a Solana address (base58, 32-44 chars, no 0x prefix)
   */
  private isSolanaAddress(address?: string): boolean {
    if (!address) return false;
    // Solana addresses are base58 encoded, typically 32-44 characters
    // They don't start with 0x and contain only alphanumeric chars (no 0, O, I, l)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }

  /**
   * Fetch wallet tokens with caching and automatic fallback to demo data
   */
  async getWalletTokens(address: string, forceRefresh: boolean = false): Promise<WalletTokensResult> {
    // Debug: Log config state
    console.log('[WalletProvider] getWalletTokens called:', {
      hasApiKey: !!this.config.debankApiKey,
      apiKeyLength: this.config.debankApiKey?.length || 0,
      useDemoData: this.config.useDemoData,
      address: address.slice(0, 10) + '...',
    });

    // If explicitly using demo data or no API key
    if (this.config.useDemoData || !this.config.debankApiKey) {
      console.warn('[WalletProvider] USING DEMO DATA - Reason:', {
        useDemoDataFlag: this.config.useDemoData,
        hasApiKey: !!this.config.debankApiKey,
        apiKeyLength: this.config.debankApiKey?.length || 0,
        configKeys: Object.keys(this.config),
      });
      return {
        tokens: generateDemoWalletTokens(address),
        isDemo: true,
      };
    }

    console.log('[WalletProvider] Will call DeBank API with key length:', this.config.debankApiKey?.length);

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
      console.log('[WalletProvider] Calling DeBank API...');
      const client = getDebankApiClient(this.config.debankApiKey);
      const rawTokens = await client.getWalletTokens(address);
      console.log('[WalletProvider] DeBank API returned', rawTokens.length, 'tokens');

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

          // Exclude if explicitly marked as scam/suspicious by DeBank
          if (token.is_scam === true || token.is_suspicious === true) return false;

          // Exclude spam tokens using pattern matching (checks symbol and name)
          if (isSpamToken(token.symbol, token.name)) return false;

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
          tokenId: token.id,
        }))
        .sort((a, b) => b.value - a.value);

      const result = { tokens, isDemo: false };

      // Cache the result
      const ttl = this.config.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
      setCache(cacheKey, result, ttl);
      console.log(`[CACHE] Cached ${tokens.length} tokens for ${address.slice(0, 8)}...`);

      return result;
    } catch (error) {
      console.error('[WalletProvider] API error, falling back to demo data:', {
        errorType: error?.constructor?.name,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
        const aggregatedRewards = new Map<string, { symbol: string; amount: number; price: number }>();
        let totalValue = 0;

        for (const item of protocol.portfolio_item_list || []) {
          totalValue += item.stats?.net_usd_value || 0;

          // Aggregate supply tokens (filter spam)
          for (const t of item.detail?.supply_token_list || []) {
            // Skip spam tokens using pattern matching
            if (isSpamToken(t.symbol, t.name)) continue;

            const key = `${t.symbol.toLowerCase()}-${t.chain || ''}`;
            const existing = aggregatedSupply.get(key);
            if (existing) {
              existing.amount += t.amount;
            } else {
              aggregatedSupply.set(key, { symbol: t.symbol, amount: t.amount, price: t.price });
            }
          }

          // Aggregate debt tokens (filter spam)
          for (const t of item.detail?.borrow_token_list || []) {
            // Skip spam tokens using pattern matching
            if (isSpamToken(t.symbol, t.name)) continue;

            const key = `${t.symbol.toLowerCase()}-${t.chain || ''}`;
            const existing = aggregatedDebt.get(key);
            if (existing) {
              existing.amount += t.amount;
            } else {
              aggregatedDebt.set(key, { symbol: t.symbol, amount: t.amount, price: t.price });
            }
          }

          // Aggregate reward tokens (vesting, claimable rewards - e.g., Sablier)
          for (const t of item.detail?.reward_token_list || []) {
            // Skip spam tokens using pattern matching
            if (isSpamToken(t.symbol, t.name)) continue;

            const key = `${t.symbol.toLowerCase()}-${t.chain || ''}`;
            const existing = aggregatedRewards.get(key);
            if (existing) {
              existing.amount += t.amount;
            } else {
              aggregatedRewards.set(key, { symbol: t.symbol, amount: t.amount, price: t.price });
            }
          }

          // Also check for generic token_list (some protocols use this instead of specific lists)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const genericTokenList = (item.detail as any)?.token_list;
          if (Array.isArray(genericTokenList)) {
            for (const t of genericTokenList) {
              if (!t?.symbol || isSpamToken(t.symbol, t.name)) continue;

              const key = `${t.symbol.toLowerCase()}-${t.chain || ''}`;
              // Add to supply if not already there (treat generic tokens as supply/assets)
              if (!aggregatedSupply.has(key) && !aggregatedRewards.has(key)) {
                aggregatedSupply.set(key, { symbol: t.symbol, amount: t.amount || 0, price: t.price || 0 });
              }
            }
          }
        }

        // Combine supply tokens and reward tokens (both are assets)
        // Reward tokens include vesting/locked tokens (e.g., Sablier vesting streams)
        // Merge reward amounts into supply when they overlap (same token on same chain)
        // Only add reward tokens as separate entries when they don't exist in supply
        for (const [key, reward] of aggregatedRewards.entries()) {
          const existing = aggregatedSupply.get(key);
          if (existing) {
            // Merge reward amount into existing supply entry
            existing.amount += reward.amount;
          } else {
            // Add as new entry
            aggregatedSupply.set(key, reward);
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
    // Separate wallets by type
    const evmWallets = wallets.filter(w => w.address?.startsWith('0x'));
    const solanaWallets = wallets.filter(w => this.isSolanaAddress(w.address));
    const otherWallets = wallets.filter(w =>
      !w.address?.startsWith('0x') && !this.isSolanaAddress(w.address)
    );

    if (otherWallets.length > 0) {
      console.log('[WalletProvider.fetchAllWalletPositions] Skipping unsupported wallets:',
        otherWallets.map(w => `${w.address?.slice(0, 10)}... (${w.name || 'unnamed'})`));
    }

    console.log('[WalletProvider.fetchAllWalletPositions] Called with:', {
      totalWallets: wallets.length,
      evmWallets: evmWallets.length,
      solanaWallets: solanaWallets.length,
      otherWallets: otherWallets.length,
      forceRefresh,
      hasDebankKey: !!this.config.debankApiKey,
      hasHeliusKey: !!this.config.heliusApiKey,
      useDemoData: this.config.useDemoData,
    });

    if (evmWallets.length === 0 && solanaWallets.length === 0) {
      console.log('[WalletProvider.fetchAllWalletPositions] No supported wallets, returning empty');
      return { positions: [], prices: {} };
    }

    if (forceRefresh) {
      console.log('[CACHE] Force refresh requested - bypassing cache');
    }

    const allPositions: Position[] = [];
    const debankPrices: Record<string, { price: number; symbol: string }> = {};

    for (const wallet of evmWallets) {
      // FIRST: Fetch DeFi protocol positions (including debt)
      const { positions: protocolPositions } = await this.getWalletProtocols(wallet.address, forceRefresh);

      // Track seen position IDs to avoid duplicates within protocols
      const seenPositionIds = new Set<string>();

      for (const defiPos of protocolPositions) {
        // Add supply tokens (collateral, lending, staking, LP)
        for (const token of defiPos.tokens) {
          // Skip tokens with zero amount, but allow price=0 (pre-market, new tokens)
          if (token.amount <= 0) continue;

          // Skip spam tokens using pattern matching
          if (isSpamToken(token.symbol)) continue;

          // Use protocol + type + symbol + chain for unique ID
          const positionId = `${wallet.id}-${defiPos.protocol}-${defiPos.type}-${token.symbol}-${defiPos.chain}-supply`;

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

            // Skip spam tokens using pattern matching
            if (isSpamToken(token.symbol)) continue;

            // Use protocol + type + symbol + chain for unique ID
            const positionId = `${wallet.id}-${defiPos.protocol}-${defiPos.type}-${token.symbol}-${defiPos.chain}-debt`;

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

      // SECOND: Fetch regular wallet tokens
      // DeBank's token API returns wallet balances SEPARATE from protocol deposits,
      // so there's no double-counting - we include all wallet tokens
      const { tokens } = await this.getWalletTokens(wallet.address, forceRefresh);

      const walletPositions = tokens.map((token, index) => {
          // Store the price from DeBank
          const priceKey = `debank-${token.symbol.toLowerCase()}-${token.chain}`;
          debankPrices[priceKey] = {
            price: token.price,
            symbol: token.symbol,
          };

          return {
            id: `${wallet.id}-${token.chain}-${token.symbol}-${index}`,
            type: 'crypto' as const,
            symbol: token.symbol,
            name: token.name,
            amount: token.amount,
            walletAddress: wallet.address,
            chain: token.chain,
            debankPriceKey: priceKey,
            logo: token.logo, // Preserve logo URL from DeBank API
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

    // FOURTH: Fetch Solana wallet positions using Helius API
    for (const wallet of solanaWallets) {
      const solanaResult = await this.getSolanaWalletTokens(wallet.address, forceRefresh);

      if (solanaResult.error) {
        console.warn(`[WalletProvider] Solana wallet ${wallet.address.slice(0, 8)}... error:`, solanaResult.error);
      }

      const solanaPositions = solanaResult.tokens.map((token, index) => {
        const priceKey = `helius-${token.symbol.toLowerCase()}-sol`;
        debankPrices[priceKey] = {
          price: token.price,
          symbol: token.symbol,
        };

        return {
          id: `${wallet.id}-sol-${token.symbol}-${index}`,
          type: 'crypto' as const,
          symbol: token.symbol,
          name: token.name,
          amount: token.amount,
          walletAddress: wallet.address,
          chain: 'sol',
          debankPriceKey: priceKey,
          logo: token.logo, // Preserve logo URL from Helius API
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      allPositions.push(...solanaPositions);
    }

    return { positions: allPositions, prices: debankPrices };
  }

  /**
   * Fetch Solana wallet tokens using Helius API
   */
  async getSolanaWalletTokens(address: string, forceRefresh: boolean = false): Promise<WalletTokensResult> {
    console.log('[WalletProvider] getSolanaWalletTokens called:', {
      hasApiKey: !!this.config.heliusApiKey,
      address: address.slice(0, 10) + '...',
    });

    // If no Helius API key, return empty (not demo data for Solana)
    if (!this.config.heliusApiKey) {
      console.warn('[WalletProvider] No Helius API key configured for Solana wallet');
      return {
        tokens: [],
        isDemo: false,
        error: 'Helius API key not configured. Add it in Settings to track Solana wallets.',
      };
    }

    // Check cache first (unless force refresh)
    const cacheKey = `solana_tokens_${address.toLowerCase()}`;
    if (!forceRefresh) {
      const cached = getCached<WalletTokensResult>(cacheKey);
      if (cached) {
        console.log(`[CACHE] Using cached Solana tokens for ${address.slice(0, 8)}... (${formatCacheAge(cached.age)})`);
        return cached.data;
      }
    }

    try {
      console.log('[WalletProvider] Calling Helius API...');
      const url = `/api/solana/tokens?address=${encodeURIComponent(address)}&apiKey=${encodeURIComponent(this.config.heliusApiKey)}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.error || 'Failed to fetch Solana tokens',
          response.status,
          'helius'
        );
      }

      const rawTokens = await response.json();
      console.log('[WalletProvider] Helius API returned', rawTokens.length, 'tokens');

      // Transform to WalletBalance format (already filtered by API route)
      const tokens: WalletBalance[] = rawTokens
        .filter((token: any) => {
          // Skip spam tokens
          if (isSpamToken(token.symbol, token.name)) return false;
          return true;
        })
        .map((token: any) => ({
          symbol: token.symbol,
          name: token.name,
          amount: token.amount,
          price: token.price || 0,
          value: token.value || 0,
          chain: 'sol',
          logo: token.logo_url,
          isVerified: token.is_verified,
        }));

      const result = { tokens, isDemo: false };

      // Cache the result
      const ttl = this.config.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
      setCache(cacheKey, result, ttl);
      console.log(`[CACHE] Cached ${tokens.length} Solana tokens for ${address.slice(0, 8)}...`);

      return result;
    } catch (error) {
      console.error('[WalletProvider] Helius API error:', error);
      return {
        tokens: [],
        isDemo: false,
        error: error instanceof ApiError ? error.message : 'Failed to fetch Solana tokens',
      };
    }
  }
}

// Singleton instance
let instance: WalletProvider | null = null;

export function getWalletProvider(config?: WalletProviderConfig): WalletProvider {
  console.log('[getWalletProvider] Called with config:', {
    hasConfig: !!config,
    hasDebankKey: !!config?.debankApiKey,
    hasHeliusKey: !!config?.heliusApiKey,
    useDemoData: config?.useDemoData,
    instanceExists: !!instance,
  });

  if (!instance) {
    console.log('[getWalletProvider] Creating new instance');
    instance = new WalletProvider(config);
  } else if (config) {
    console.log('[getWalletProvider] Updating existing instance config');
    instance.updateConfig(config);
  }

  // Log the current instance config state
  console.log('[getWalletProvider] Instance config after update:', {
    hasDebankKey: !!instance['config'].debankApiKey,
    hasHeliusKey: !!instance['config'].heliusApiKey,
    useDemoData: instance['config'].useDemoData,
  });

  return instance;
}

/**
 * Clear all wallet data cache
 * Useful for debugging or forcing fresh data
 */
export function clearWalletCache(): void {
  clearAllCache();
}
