/**
 * Ethereal API Client
 * Direct API integration for Ethereal perps exchange
 *
 * API Documentation: https://docs.ethereal.trade/developer-guides/trading-api
 */

import { ApiError } from './types';

// Use local proxy to avoid CORS issues
const ETHEREAL_API_URL = '/api/perps/ethereal';

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
  private baseUrl: string;

  constructor(baseUrl: string = ETHEREAL_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a GET request to the Ethereal API via proxy
   */
  private async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    try {
      // Build URL for proxy - use window.location.origin for relative paths
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const url = new URL(this.baseUrl, base);
      url.searchParams.append('endpoint', endpoint);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new ApiError(
          `Ethereal API error: ${response.status}`,
          response.status,
          'ethereal'
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
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
