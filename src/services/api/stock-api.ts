/**
 * Stock API Client (Finnhub)
 * Pure HTTP client for stock price data - no business logic or fallbacks
 */

import { StockQuoteResponse, ApiError } from './types';

const BASE_URL = 'https://finnhub.io/api/v1';

export class StockApiClient {
  constructor(private apiKey?: string) {}

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async getQuote(symbol: string): Promise<StockQuoteResponse> {
    if (!this.apiKey) {
      throw new ApiError('Stock API key not configured', 401, 'finnhub');
    }

    const url = `${BASE_URL}/quote?symbol=${symbol.toUpperCase()}&token=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new ApiError(
        'Failed to fetch stock quote',
        response.status,
        'finnhub'
      );
    }

    const data = await response.json();

    // Finnhub returns {c: 0, d: null, dp: null, ...} for invalid symbols
    if (data.c === 0 && data.d === null) {
      throw new ApiError(`Invalid stock symbol: ${symbol}`, 404, 'finnhub');
    }

    return data;
  }

  async getMultipleQuotes(
    symbols: string[]
  ): Promise<Map<string, StockQuoteResponse>> {
    const results = new Map<string, StockQuoteResponse>();

    // Finnhub doesn't have a batch endpoint, so we fetch sequentially
    // with a small delay to avoid rate limiting
    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        results.set(symbol.toLowerCase(), quote);
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.warn(`Failed to fetch quote for ${symbol}:`, error);
      }
    }

    return results;
  }
}

// Singleton instance
let instance: StockApiClient | null = null;

export function getStockApiClient(apiKey?: string): StockApiClient {
  if (!instance) {
    instance = new StockApiClient(apiKey);
  } else if (apiKey) {
    instance.setApiKey(apiKey);
  }
  return instance;
}
