/**
 * Provider Layer - Data Providers
 *
 * Providers abstract over API clients and handle:
 * - Fallback to demo data when APIs fail
 * - Caching
 * - Data transformation
 */

export * from './demo-data';
export * from './wallet-provider';
export * from './price-provider';

// Re-export commonly used constants
export { SUPPORTED_CHAINS } from './demo-data';
