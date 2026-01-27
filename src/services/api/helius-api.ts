/**
 * Helius API Client
 * Pure HTTP client for Helius API (Solana) - no business logic or fallbacks
 */

import { ApiError } from './types';

export interface HeliusTokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  tokenAccount: string;
  // Enriched data from Helius
  name?: string;
  symbol?: string;
  logoURI?: string;
  pricePerToken?: number;
  valueUsd?: number;
}

export interface HeliusBalanceResponse {
  tokens: HeliusTokenBalance[];
  nativeBalance: {
    lamports: number;
    price_per_sol: number;
    total_price: number;
  };
}

export class HeliusApiClient {
  constructor(private apiKey?: string) {}

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async getBalances(address: string): Promise<HeliusBalanceResponse> {
    if (!this.apiKey) {
      throw new ApiError('Helius API key not configured', 401, 'helius');
    }

    const url = `https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Helius API error: ${response.status} - ${errorText}`,
        response.status,
        'helius'
      );
    }

    const data = await response.json();
    return data;
  }

  /**
   * Get enriched token metadata and prices using DAS API
   */
  async getTokensWithPrices(address: string): Promise<HeliusBalanceResponse> {
    if (!this.apiKey) {
      throw new ApiError('Helius API key not configured', 401, 'helius');
    }

    // Use the balances endpoint which includes token metadata and prices
    const url = `https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Helius API error: ${response.status} - ${errorText}`,
        response.status,
        'helius'
      );
    }

    return response.json();
  }
}

// Singleton instance
let instance: HeliusApiClient | null = null;

export function getHeliusApiClient(apiKey?: string): HeliusApiClient {
  if (!instance) {
    instance = new HeliusApiClient(apiKey);
  } else if (apiKey) {
    instance.setApiKey(apiKey);
  }
  return instance;
}
