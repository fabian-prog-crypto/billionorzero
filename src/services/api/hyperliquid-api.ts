/**
 * Hyperliquid API Client
 * Direct API integration for Hyperliquid perps exchange
 *
 * API Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

import { ApiError } from './types';

// Use local proxy to avoid CORS issues
const HYPERLIQUID_API_URL = '/api/perps/hyperliquid';

/**
 * Perp position from clearinghouseState
 */
export interface HyperliquidPosition {
  coin: string;
  entryPx: string | null;
  leverage: {
    type: string;
    value: number;
    rawUsd?: string;
  };
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  positionValue: string;
  returnOnEquity: string;
  szi: string; // Size (positive = long, negative = short)
  unrealizedPnl: string;
  cumFunding: {
    allTime: string;
    sinceChange: string;
    sinceOpen: string;
  };
}

/**
 * Asset position wrapper
 */
export interface HyperliquidAssetPosition {
  position: HyperliquidPosition;
  type: string;
}

/**
 * Margin summary
 */
export interface HyperliquidMarginSummary {
  accountValue: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  totalRawUsd: string;
}

/**
 * Clearinghouse state response
 */
export interface HyperliquidClearinghouseState {
  assetPositions: HyperliquidAssetPosition[];
  crossMaintenanceMarginUsed: string;
  crossMarginSummary: HyperliquidMarginSummary;
  marginSummary: HyperliquidMarginSummary;
  time: number;
  withdrawable: string;
}

/**
 * Spot balance
 */
export interface HyperliquidSpotBalance {
  coin: string;
  token: number;
  hold: string;
  total: string;
  entryNtl: string;
}

/**
 * Spot clearinghouse state response
 */
export interface HyperliquidSpotState {
  balances: HyperliquidSpotBalance[];
}

/**
 * Spot token metadata
 */
export interface HyperliquidSpotMeta {
  tokens: {
    name: string;
    szDecimals: number;
    weiDecimals: number;
    index: number;
    tokenId: string;
    isCanonical: boolean;
    evmContract: string | null;
    fullName: string | null;
  }[];
  universe: {
    tokens: [number, number]; // [baseToken, quoteToken]
    name: string;
    index: number;
    isCanonical: boolean;
  }[];
}

/**
 * Perp asset metadata
 */
export interface HyperliquidPerpMeta {
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated: boolean;
  }[];
}

/**
 * Hyperliquid API Client
 */
export class HyperliquidApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = HYPERLIQUID_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a POST request to the Hyperliquid info endpoint via proxy
   */
  private async post<T>(body: Record<string, unknown>): Promise<T> {
    try {
      // Build URL for proxy - use window.location.origin for relative paths
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const url = new URL(this.baseUrl, base);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new ApiError(
          `Hyperliquid API error: ${response.status}`,
          response.status,
          'hyperliquid'
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        `Hyperliquid API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'hyperliquid'
      );
    }
  }

  /**
   * Get user's perpetual positions and margin info
   */
  async getClearinghouseState(userAddress: string): Promise<HyperliquidClearinghouseState> {
    return this.post<HyperliquidClearinghouseState>({
      type: 'clearinghouseState',
      user: userAddress,
    });
  }

  /**
   * Get user's spot token balances
   */
  async getSpotClearinghouseState(userAddress: string): Promise<HyperliquidSpotState> {
    return this.post<HyperliquidSpotState>({
      type: 'spotClearinghouseState',
      user: userAddress,
    });
  }

  /**
   * Get spot token metadata (names, decimals, etc.)
   */
  async getSpotMeta(): Promise<HyperliquidSpotMeta> {
    return this.post<HyperliquidSpotMeta>({
      type: 'spotMeta',
    });
  }

  /**
   * Get perp asset metadata
   */
  async getPerpMeta(): Promise<HyperliquidPerpMeta> {
    return this.post<HyperliquidPerpMeta>({
      type: 'meta',
    });
  }

  /**
   * Get all mid prices for assets
   */
  async getAllMids(): Promise<Record<string, string>> {
    return this.post<Record<string, string>>({
      type: 'allMids',
    });
  }
}

// Singleton instance
let instance: HyperliquidApiClient | null = null;

export function getHyperliquidApiClient(): HyperliquidApiClient {
  if (!instance) {
    instance = new HyperliquidApiClient();
  }
  return instance;
}
