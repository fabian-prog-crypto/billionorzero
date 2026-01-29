/**
 * Birdeye API Client
 * Alternative provider for Solana token balances with better coverage
 * https://docs.birdeye.so/docs/wallet-portfolio
 */

import { ApiError } from './types';

export interface BirdeyeToken {
  address: string;
  decimals: number;
  balance: number;
  uiAmount: number;
  chainId: string;
  name: string;
  symbol: string;
  logoURI: string | null;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface BirdeyeWalletResponse {
  success: boolean;
  data: {
    wallet: string;
    totalUsd: number;
    items: BirdeyeToken[];
  };
}

const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';

export class BirdeyeApiClient {
  constructor(private apiKey?: string) {}

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get all tokens in a Solana wallet with prices
   */
  async getWalletTokens(address: string): Promise<BirdeyeToken[]> {
    if (!this.apiKey) {
      throw new ApiError('Birdeye API key not configured', 401, 'birdeye');
    }

    const url = `${BIRDEYE_API_BASE}/v1/wallet/token_list?wallet=${address}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'X-API-KEY': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Birdeye API error: ${response.status} - ${errorText}`,
        response.status,
        'birdeye'
      );
    }

    const data: BirdeyeWalletResponse = await response.json();

    if (!data.success) {
      throw new ApiError('Birdeye API returned unsuccessful response', 500, 'birdeye');
    }

    return data.data.items || [];
  }

  /**
   * Get token price by address
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    if (!this.apiKey) {
      throw new ApiError('Birdeye API key not configured', 401, 'birdeye');
    }

    const url = `${BIRDEYE_API_BASE}/defi/price?address=${tokenAddress}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'X-API-KEY': this.apiKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data?.value || null;
  }
}

// Singleton instance
let instance: BirdeyeApiClient | null = null;

export function getBirdeyeApiClient(apiKey?: string): BirdeyeApiClient {
  if (!instance) {
    instance = new BirdeyeApiClient(apiKey);
  } else if (apiKey) {
    instance.setApiKey(apiKey);
  }
  return instance;
}
