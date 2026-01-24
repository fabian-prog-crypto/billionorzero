/**
 * Lighter API Client
 * Direct API integration for Lighter perps exchange
 *
 * API Documentation: https://apidocs.lighter.xyz
 */

import { ApiError } from './types';

// Use local proxy to avoid CORS issues
const LIGHTER_API_URL = '/api/perps/lighter';

/**
 * Position from account response
 */
export interface LighterPosition {
  market_id: number;
  symbol: string;
  position: string; // Size as string
  sign: number; // 1 = long, -1 = short
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  allocated_margin: string;
  margin_mode: string;
}

/**
 * Asset balance from account response
 */
export interface LighterAsset {
  symbol: string;
  asset_id: number;
  balance: string;
  locked_balance: string;
}

/**
 * Account response
 */
export interface LighterAccount {
  index: number;
  l1_address: string;
  collateral: string;
  available_balance: string;
  total_asset_value: string;
  positions: LighterPosition[];
  assets: LighterAsset[];
}

/**
 * API response wrapper for account endpoint
 */
interface LighterAccountResponse {
  code: number;
  total: number;
  accounts: LighterAccount[];
}

/**
 * API response wrapper for accountsByL1Address endpoint
 */
interface LighterAccountsByL1Response {
  code: number;
  l1_address: string;
  sub_accounts: { index: number; l1_address: string; collateral: string }[];
}

/**
 * Asset details response
 */
export interface LighterAssetDetails {
  asset_id: number;
  symbol: string;
  decimals: number;
  l1_address: string;
  index_price: string;
  margin_mode: string;
}

/**
 * Asset details API response wrapper
 */
interface LighterAssetDetailsResponse {
  code: number;
  asset_details: LighterAssetDetails[];
}

/**
 * Market info for price data
 */
export interface LighterMarket {
  market_id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  last_price: string;
  mark_price: string;
  index_price: string;
}

/**
 * Lighter API Client
 */
export class LighterApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = LIGHTER_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a GET request to the Lighter API via proxy
   * Note: Lighter returns errors with HTTP 200 but error codes in the body
   */
  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    try {
      // Build URL for proxy - use window.location.origin for relative paths
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const url = new URL(this.baseUrl + path, base);
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
          `Lighter API error: ${response.status}`,
          response.status,
          'lighter'
        );
      }

      const data = await response.json();

      // Lighter returns errors with HTTP 200 but error code in body
      // Success code is 200, error codes are like 21100
      if (data.code && data.code !== 200) {
        throw new ApiError(
          data.message || `Lighter API error code: ${data.code}`,
          data.code,
          'lighter'
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        `Lighter API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'lighter'
      );
    }
  }

  /**
   * Get account by index
   */
  async getAccountByIndex(index: number): Promise<LighterAccount | null> {
    try {
      const result = await this.get<LighterAccountResponse>('', {
        endpoint: 'account',
        by: 'index',
        value: index.toString(),
      });
      if (result.accounts && result.accounts.length > 0) {
        return result.accounts[0];
      }
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get account by L1 wallet address
   */
  async getAccountByAddress(walletAddress: string): Promise<LighterAccount | null> {
    try {
      const result = await this.get<LighterAccountResponse>('', {
        endpoint: 'account',
        by: 'l1_address',
        value: walletAddress,
      });
      if (result.accounts && result.accounts.length > 0) {
        return result.accounts[0];
      }
      return null;
    } catch (error) {
      // Return null if account not found
      if (error instanceof ApiError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all accounts by L1 address (user may have multiple sub-accounts)
   * This returns minimal info, so we need to fetch full details by index
   */
  async getAccountsByL1Address(walletAddress: string): Promise<LighterAccount[]> {
    try {
      const result = await this.get<LighterAccountsByL1Response>('', {
        endpoint: 'accountsByL1Address',
        address: walletAddress,
      });

      if (!result.sub_accounts || result.sub_accounts.length === 0) {
        return [];
      }

      // Fetch full account details for each sub-account
      const accounts: LighterAccount[] = [];
      for (const subAccount of result.sub_accounts) {
        const fullAccount = await this.getAccountByIndex(subAccount.index);
        if (fullAccount) {
          accounts.push(fullAccount);
        }
      }

      return accounts;
    } catch (error) {
      if (error instanceof ApiError) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get asset details with prices
   */
  async getAssetDetails(): Promise<LighterAssetDetails[]> {
    const result = await this.get<LighterAssetDetailsResponse>('', {
      endpoint: 'assetDetails',
    });
    return result.asset_details || [];
  }

  /**
   * Get all markets with prices
   */
  async getMarkets(): Promise<LighterMarket[]> {
    const result = await this.get<{ code: number; order_books: LighterMarket[] }>('/api/v1/orderBooks');
    return result.order_books || [];
  }
}

// Singleton instance
let instance: LighterApiClient | null = null;

export function getLighterApiClient(): LighterApiClient {
  if (!instance) {
    instance = new LighterApiClient();
  }
  return instance;
}
