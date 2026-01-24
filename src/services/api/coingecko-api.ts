/**
 * CoinGecko API Client
 * Pure HTTP client for CoinGecko API - no business logic or fallbacks
 */

import { CoinGeckoPriceResponse, CoinGeckoSearchResult, ApiError } from './types';

const BASE_URL = 'https://api.coingecko.com/api/v3';

// Rate limiting: CoinGecko free tier allows ~10-30 calls/min
const RATE_LIMIT_DELAY = 1500; // ms between requests
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

export class CoinGeckoApiClient {
  async getPrices(
    coinIds: string[],
    vsCurrency: string = 'usd'
  ): Promise<CoinGeckoPriceResponse> {
    if (coinIds.length === 0) {
      return {};
    }

    const url = `${BASE_URL}/simple/price?ids=${coinIds.join(',')}&vs_currencies=${vsCurrency}&include_24hr_change=true`;

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new ApiError('CoinGecko rate limit exceeded', 429, 'coingecko');
      }
      throw new ApiError(
        'Failed to fetch prices from CoinGecko',
        response.status,
        'coingecko'
      );
    }

    return response.json();
  }

  async searchCoin(query: string): Promise<CoinGeckoSearchResult[]> {
    const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new ApiError(
        'Failed to search coins on CoinGecko',
        response.status,
        'coingecko'
      );
    }

    const data = await response.json();
    return data.coins || [];
  }

  async getCoinList(): Promise<{ id: string; symbol: string; name: string }[]> {
    const url = `${BASE_URL}/coins/list`;

    const response = await rateLimitedFetch(url);

    if (!response.ok) {
      throw new ApiError(
        'Failed to fetch coin list from CoinGecko',
        response.status,
        'coingecko'
      );
    }

    return response.json();
  }
}

// Singleton instance
let instance: CoinGeckoApiClient | null = null;

export function getCoinGeckoApiClient(): CoinGeckoApiClient {
  if (!instance) {
    instance = new CoinGeckoApiClient();
  }
  return instance;
}
