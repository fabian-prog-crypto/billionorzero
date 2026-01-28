/**
 * FX Rate API Client
 * Fetches foreign exchange rates for fiat currency conversion
 * Uses frankfurter.app (free, no API key required)
 */

// Frankfurter API returns EUR-based rates, so we convert to USD-based
const BASE_URL = 'https://api.frankfurter.app';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

interface FxRateCache {
  rates: Record<string, number>; // Currency -> USD rate
  timestamp: number;
}

let rateCache: FxRateCache | null = null;

/**
 * Fallback FX rates (updated Jan 2025)
 * Used when API is unavailable
 * Rates are: 1 unit of currency = X USD
 */
const FALLBACK_FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.19,
  GBP: 1.37,
  CHF: 1.30,
  JPY: 0.0065,
  CAD: 0.73,
  AUD: 0.69,
  NZD: 0.60,
  CNY: 0.14,
  HKD: 0.13,
  SGD: 0.79,
  SEK: 0.11,
  NOK: 0.10,
  DKK: 0.16,
  PLN: 0.28,
  CZK: 0.049,
  HUF: 0.0031,
  RON: 0.23,
  BGN: 0.61,
  ISK: 0.0082,
  TRY: 0.023,
  BRL: 0.19,
  MXN: 0.058,
  ZAR: 0.063,
  INR: 0.011,
  KRW: 0.00069,
  THB: 0.032,
  IDR: 0.00006,
  MYR: 0.25,
  PHP: 0.017,
  ILS: 0.32,
  AED: 0.27,
  TWD: 0.031,
  VND: 0.00004,
};

export class FxApiClient {
  /**
   * Get FX rate for a currency to USD
   * Returns the USD value of 1 unit of the currency
   */
  async getRate(currency: string): Promise<number> {
    const rates = await this.getAllRates();
    const upperCurrency = currency.toUpperCase();
    return rates[upperCurrency] ?? FALLBACK_FX_RATES[upperCurrency] ?? 1.0;
  }

  /**
   * Get all FX rates (currency -> USD)
   */
  async getAllRates(): Promise<Record<string, number>> {
    // Check cache
    if (rateCache && Date.now() - rateCache.timestamp < CACHE_DURATION) {
      return rateCache.rates;
    }

    try {
      // Fetch EUR-based rates from Frankfurter
      const response = await fetch(`${BASE_URL}/latest?from=EUR`);

      if (!response.ok) {
        console.warn('[FX] API request failed, using fallback rates');
        return FALLBACK_FX_RATES;
      }

      const data = await response.json();
      // data.rates contains EUR -> other currency rates
      // e.g., { USD: 1.08, GBP: 0.85, CHF: 0.94, ... }

      const eurRates = data.rates as Record<string, number>;
      const eurToUsd = eurRates.USD || 1.08;

      // Convert to USD-based rates
      // If EUR/USD = 1.08 (1 EUR = 1.08 USD)
      // And EUR/CHF = 0.94 (1 EUR = 0.94 CHF)
      // Then CHF/USD = EUR/USD / EUR/CHF = 1.08 / 0.94 = 1.15 (1 CHF = 1.15 USD)
      const usdRates: Record<string, number> = { USD: 1.0 };

      for (const [currency, eurRate] of Object.entries(eurRates)) {
        if (currency === 'USD') {
          usdRates.USD = 1.0;
        } else {
          // EUR/USD divided by EUR/currency = currency/USD
          usdRates[currency] = eurToUsd / eurRate;
        }
      }

      // Add EUR itself
      usdRates.EUR = eurToUsd;

      // Cache the results
      rateCache = {
        rates: usdRates,
        timestamp: Date.now(),
      };

      console.log('[FX] Fetched rates:', Object.keys(usdRates).length, 'currencies');
      return usdRates;
    } catch (error) {
      console.warn('[FX] Failed to fetch rates, using fallback:', error);
      return FALLBACK_FX_RATES;
    }
  }

  /**
   * Clear the rate cache
   */
  clearCache(): void {
    rateCache = null;
  }
}

// Singleton instance
let instance: FxApiClient | null = null;

export function getFxApiClient(): FxApiClient {
  if (!instance) {
    instance = new FxApiClient();
  }
  return instance;
}

/**
 * Get FX rate for a currency (convenience function)
 */
export async function getFxRate(currency: string): Promise<number> {
  return getFxApiClient().getRate(currency);
}

/**
 * Get all FX rates (convenience function)
 */
export async function getAllFxRates(): Promise<Record<string, number>> {
  return getFxApiClient().getAllRates();
}

/**
 * Get fallback FX rates (for synchronous use)
 */
export function getFallbackFxRates(): Record<string, number> {
  return { ...FALLBACK_FX_RATES };
}
