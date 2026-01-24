/**
 * Services Layer - Main Entry Point
 *
 * Modern modular architecture:
 *
 * /api          - Pure HTTP clients for external APIs
 * /providers    - Data providers with fallback handling
 * /domain       - Business logic and calculations
 * /config       - Centralized configuration management
 *
 * Usage:
 *
 * // Get the main portfolio service
 * import { getPortfolioService } from '@/services';
 * const portfolioService = getPortfolioService();
 * portfolioService.initialize();
 * const result = await portfolioService.refreshPortfolio(positions, wallets);
 *
 * // Or use individual providers
 * import { getWalletProvider, getPriceProvider } from '@/services';
 * const wallets = await getWalletProvider().fetchAllWalletPositions(wallets);
 *
 * // Domain functions for calculations
 * import { calculateAllPositionsWithPrices, calculatePortfolioSummary } from '@/services';
 * const enrichedPositions = calculateAllPositionsWithPrices(positions, prices);
 *
 * // Configuration management
 * import { getConfigManager } from '@/services';
 * getConfigManager().setDebankApiKey('your-api-key');
 */

// API Layer
export * from './api';

// Provider Layer
export * from './providers';

// Domain Layer
export * from './domain';

// Configuration Layer
export * from './config';

// Utils (caching, etc.)
export * from './utils';

// Main Portfolio Service
export * from './portfolio-service';
