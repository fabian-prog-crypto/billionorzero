/**
 * Ethereal API Client
 * Direct API integration for Ethereal perps exchange
 *
 * API Documentation: https://docs.ethereal.trade/developer-guides/trading-api
 */

import { ApiError } from './types';

// Proxy URL for client-side (avoids CORS)
const ETHEREAL_PROXY_URL = '/api/perps/ethereal';
// Direct API URL for server-side (no CORS issues)
const ETHEREAL_DIRECT_URL = 'https://api.ethereal.trade';

/**
 * Position from positions endpoint
 */
export interface EtherealPosition {
  id: string;
  subaccountId: string;
  productId: number;
  symbol: string;
  size: string;
  side: 'long' | 'short';
  avgEntryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPrice: string | null;
  isLiquidated: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Balance from balances endpoint
 */
export interface EtherealBalance {
  subaccountId: string;
  tokenId: string;
  tokenAddress: string;
  tokenName: string;
  amount: string;
  available: string;
  totalUsed: string;
  updatedAt: number;
}

/**
 * Subaccount info
 */
export interface EtherealSubaccount {
  id: string;
  account: string;
  name: string;
  createdBlockNumber: string;
  registeredBlockNumber: string;
  createdAt: number;
}

/**
 * Paginated response wrapper
 */
export interface EtherealPage<T> {
  data: T[];
  hasNext: boolean;
}

/**
 * Product (market) info
 */
export interface EtherealProduct {
  id: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: string;
  indexPrice: string;
  lastPrice: string;
}

/**
 * Ethereal API Client
 */
export class EtherealApiClient {
  private isServer: boolean;

  constructor() {
    // Detect environment - use proxy on client, direct API on server
    this.isServer = typeof window === 'undefined';
  }

  /**
   * Make a GET request to the Ethereal API with timeout
   * Uses proxy on client-side (for CORS), direct API on server-side
   */
  private async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const TIMEOUT_MS = 10000; // 10 second timeout

    try {
      let url: URL;

      if (this.isServer) {
        // Server-side: call Ethereal API directly
        url = new URL(`/v1/${endpoint}`, ETHEREAL_DIRECT_URL);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }
      } else {
        // Client-side: use proxy to avoid CORS
        url = new URL(ETHEREAL_PROXY_URL, window.location.origin);
        url.searchParams.append('endpoint', endpoint);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ApiError(
            `Ethereal API error: ${response.status}`,
            response.status,
            'ethereal'
          );
        }

        return await response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Ethereal API request timed out', 408, 'ethereal');
      }
      throw new ApiError(
        `Ethereal API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'ethereal'
      );
    }
  }

  /**
   * Get all subaccounts for a wallet address
   */
  async getSubaccounts(walletAddress: string): Promise<EtherealSubaccount[]> {
    try {
      const result = await this.get<EtherealPage<EtherealSubaccount>>('subaccount', {
        sender: walletAddress,
      });
      return result.data || [];
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get balances for a subaccount
   */
  async getSubaccountBalances(subaccountId: string): Promise<EtherealBalance[]> {
    try {
      const result = await this.get<EtherealPage<EtherealBalance>>('balance', {
        subaccountId,
      });
      return result.data || [];
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get positions for a subaccount
   */
  async getPositions(subaccountId: string, openOnly: boolean = true): Promise<EtherealPosition[]> {
    try {
      const result = await this.get<EtherealPage<EtherealPosition>>('position', {
        subaccountId,
        open: openOnly.toString(),
      });
      return result.data || [];
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get active position for a specific product
   */
  async getActivePosition(subaccountId: string, productId: number): Promise<EtherealPosition | null> {
    try {
      return await this.get<EtherealPosition>('position', {
        subaccountId,
        productId: productId.toString(),
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all products (markets) with prices
   */
  async getProducts(): Promise<EtherealProduct[]> {
    try {
      const result = await this.get<EtherealPage<EtherealProduct>>('product');
      return result.data || [];
    } catch (error) {
      return [];
    }
  }
}

// Singleton instance
let instance: EtherealApiClient | null = null;

export function getEtherealApiClient(): EtherealApiClient {
  if (!instance) {
    instance = new EtherealApiClient();
  }
  return instance;
}
