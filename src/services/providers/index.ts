/**
 * Provider Layer - Data Providers
 *
 * Providers abstract over API clients and handle:
 * - Fallback to demo data when APIs fail
 * - Caching
 * - Data transformation
 *
 * Price Services (Single Source of Truth):
 * - CryptoPriceService: All crypto prices via CoinGecko
 * - StockPriceService: All stock prices via Finnhub
 * - PriceProvider: Unified facade for both services
 */

export * from './demo-data';
export * from './wallet-provider';
export * from './crypto-price-service';
export * from './stock-price-service';
export * from './price-provider';
export * from './hyperliquid-provider';
export * from './lighter-provider';
export * from './ethereal-provider';
export * from './cex-provider';

// Re-export commonly used constants
export { SUPPORTED_CHAINS } from './demo-data';
