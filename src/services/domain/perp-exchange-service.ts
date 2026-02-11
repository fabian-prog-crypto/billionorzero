/**
 * Perp Exchange Service - Domain Service
 * Manages perpetual futures exchange configuration and data fetching
 *
 * Supported exchanges: Hyperliquid, Lighter, Ethereal
 */

import { Position, Account, WalletConnection, PerpExchange } from '@/types';
import { getHyperliquidProvider } from '../providers/hyperliquid-provider';
import { getLighterProvider } from '../providers/lighter-provider';
import { getEtherealProvider } from '../providers/ethereal-provider';

// Re-export the type for convenience
export type PerpExchangeId = PerpExchange;

// Perp exchange metadata
export interface PerpExchangeInfo {
  id: PerpExchangeId;
  name: string;
  description: string;
  color: string;
}

// Result from fetching perp positions
export interface PerpPositionsResult {
  positions: Position[];
  prices: Record<string, { price: number; symbol: string }>;
  errors: { exchange: PerpExchangeId; error: string }[];
}

/**
 * Perp Exchange Service
 * Single source of truth for perp exchange configuration and operations
 */
export class PerpExchangeService {
  // Registry of supported perp exchanges
  private readonly exchanges: Map<PerpExchangeId, PerpExchangeInfo> = new Map([
    ['hyperliquid', {
      id: 'hyperliquid',
      name: 'Hyperliquid',
      description: 'Hyperliquid perpetual futures',
      color: '#00D1FF',
    }],
    ['lighter', {
      id: 'lighter',
      name: 'Lighter',
      description: 'Lighter exchange',
      color: '#7B61FF',
    }],
    ['ethereal', {
      id: 'ethereal',
      name: 'Ethereal',
      description: 'Ethereal perpetual futures',
      color: '#FF6B6B',
    }],
  ]);

  /**
   * Get all supported perp exchanges
   */
  getSupportedExchanges(): PerpExchangeInfo[] {
    return Array.from(this.exchanges.values());
  }

  /**
   * Get exchange info by ID
   */
  getExchangeInfo(id: PerpExchangeId): PerpExchangeInfo | undefined {
    return this.exchanges.get(id);
  }

  /**
   * Get exchange name by ID
   */
  getExchangeName(id: PerpExchangeId): string {
    return this.exchanges.get(id)?.name || id;
  }

  /**
   * Check if an exchange ID is valid
   */
  isValidExchange(id: string): id is PerpExchangeId {
    return this.exchanges.has(id as PerpExchangeId);
  }

  /**
   * Get exchanges enabled for an account
   */
  getWalletExchanges(account: Account): PerpExchangeId[] {
    const conn = account.connection as WalletConnection;
    return conn.perpExchanges || [];
  }

  /**
   * Check if account has any perp exchanges enabled
   */
  hasEnabledExchanges(account: Account): boolean {
    const conn = account.connection as WalletConnection;
    return (conn.perpExchanges?.length ?? 0) > 0;
  }

  /**
   * Fetch positions from all enabled exchanges for an account
   */
  async fetchPositions(account: Account): Promise<PerpPositionsResult> {
    const enabledExchanges = this.getWalletExchanges(account);
    const conn = account.connection as WalletConnection;

    if (enabledExchanges.length === 0) {
      return { positions: [], prices: {}, errors: [] };
    }

    const allPositions: Position[] = [];
    const allPrices: Record<string, { price: number; symbol: string }> = {};
    const errors: { exchange: PerpExchangeId; error: string }[] = [];

    // Create fetch promises for each enabled exchange
    const fetchPromises = enabledExchanges.map(async (exchangeId) => {
      try {
        const result = await this.fetchFromExchange(exchangeId, account);
        if (result.positions.length > 0) {
          console.log(`[${this.getExchangeName(exchangeId)}] Found ${result.positions.length} positions for ${conn.address.slice(0, 8)}...`);
          allPositions.push(...result.positions);
          Object.assign(allPrices, result.prices);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${this.getExchangeName(exchangeId)}] Error for ${conn.address.slice(0, 8)}...:`, errorMessage);
        errors.push({ exchange: exchangeId, error: errorMessage });
      }
    });

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    return { positions: allPositions, prices: allPrices, errors };
  }

  /**
   * Fetch positions from a specific exchange
   */
  private async fetchFromExchange(
    exchangeId: PerpExchangeId,
    account: Account
  ): Promise<{ positions: Position[]; prices: Record<string, { price: number; symbol: string }> }> {
    const conn = account.connection as WalletConnection;
    switch (exchangeId) {
      case 'hyperliquid': {
        const provider = getHyperliquidProvider();
        const result = await provider.fetchPositions(conn.address, account.id);
        return { positions: result.positions, prices: result.prices };
      }
      case 'lighter': {
        const provider = getLighterProvider();
        const result = await provider.fetchPositions(conn.address, account.id);
        return { positions: result.positions, prices: result.prices };
      }
      case 'ethereal': {
        const provider = getEtherealProvider();
        const result = await provider.fetchPositions(conn.address, account.id);
        return { positions: result.positions, prices: result.prices };
      }
      default:
        throw new Error(`Unknown exchange: ${exchangeId}`);
    }
  }
}

// Singleton instance
let instance: PerpExchangeService | null = null;

export function getPerpExchangeService(): PerpExchangeService {
  if (!instance) {
    instance = new PerpExchangeService();
  }
  return instance;
}

// Convenience exports
export function getSupportedPerpExchanges(): PerpExchangeInfo[] {
  return getPerpExchangeService().getSupportedExchanges();
}

export function getPerpExchangeName(id: PerpExchangeId): string {
  return getPerpExchangeService().getExchangeName(id);
}
