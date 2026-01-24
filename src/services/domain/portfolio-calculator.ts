/**
 * Portfolio Calculator - Domain Service
 * Pure business logic for portfolio calculations
 */

import { Position, PriceData, AssetWithPrice, PortfolioSummary } from '@/types';
import { getPriceProvider } from '../providers';
import {
  AssetCategory,
  MainCategory,
  getAssetCategory,
  getMainCategory,
  getCategoryLabel,
  CATEGORY_COLORS,
  isPerpProtocol,
  getCategoryService,
} from './category-service';

/**
 * Check if a position is an actual perp trade (Long/Short position)
 * Returns { isPerpTrade, isLong, isShort }
 *
 * Matches names like:
 * - "BTC Long (Hyperliquid)"
 * - "ETH Short (Lighter)"
 * - "SOL Long" or "SOL Short"
 */
export function detectPerpTrade(name: string): { isPerpTrade: boolean; isLong: boolean; isShort: boolean } {
  const nameLower = name.toLowerCase();

  // Check for "Long" or "Short" followed by optional space and opening paren or end of string
  // This matches: "BTC Long (Hyperliquid)", "ETH Short", "SOL Long (Ethereal)"
  const longMatch = / long(\s*\(|$)/i.test(name);
  const shortMatch = / short(\s*\(|$)/i.test(name);

  return {
    isPerpTrade: longMatch || shortMatch,
    isLong: longMatch,
    isShort: shortMatch,
  };
}

/**
 * Sub-category breakdown with values (net of debt)
 */
export interface SubCategoryBreakdown {
  category: AssetCategory;
  label: string;
  value: number;           // Net value (assets - debts)
  grossAssets: number;     // Positive positions only
  debts: number;           // Debt positions (as positive number)
  percentage: number;      // Percentage of main category
  color: string;
}

/**
 * Main category breakdown with sub-categories
 */
export interface CategoryBreakdown {
  category: MainCategory;
  label: string;
  value: number;           // Net value (assets - debts)
  grossAssets: number;     // Positive positions only
  debts: number;           // Debt positions (as positive number)
  percentage: number;      // Percentage of total portfolio
  color: string;
  subCategories: SubCategoryBreakdown[];  // Breakdown by sub-category
}

/**
 * Perps breakdown (margin + positions) - part of crypto sub-categories
 */
export interface PerpsBreakdown {
  margin: number;          // Stablecoins used as margin on perp exchanges
  longs: number;           // Long perp positions (positive exposure)
  shorts: number;          // Short perp positions (negative exposure, stored as positive number)
  total: number;           // Total perps exposure (net value)
}

/**
 * Complete exposure data - single source of truth
 */
export interface ExposureData {
  categories: CategoryBreakdown[];        // Main categories with sub-categories
  perpsBreakdown: PerpsBreakdown;         // Detailed perps breakdown
  totalValue: number;                     // Net portfolio value
  grossAssets: number;                    // Total positive positions
  totalDebts: number;                     // Total debts (as positive number)
  simpleBreakdown: SimpleExposureItem[];  // Simplified breakdown for pie chart
  // Professional investor metrics
  exposureMetrics: ExposureMetrics;       // Gross/Net exposure, leverage
  perpsMetrics: ProfessionalPerpsMetrics; // Detailed perps with notional
  concentrationMetrics: ConcentrationMetrics; // Risk concentration
  spotDerivatives: SpotDerivativesBreakdown;  // Spot vs derivatives
}

/**
 * Simple exposure item for pie chart display
 * Shows: Cash & Equivalents, BTC, ETH, Tokens
 */
export interface SimpleExposureItem {
  id: 'cash' | 'btc' | 'eth' | 'tokens';
  label: string;
  value: number;
  percentage: number;
  color: string;
}

/**
 * Professional investor metrics - Gross/Net Exposure
 */
export interface ExposureMetrics {
  longExposure: number;        // Total long positions (spot + perps)
  shortExposure: number;       // Total short positions (perps shorts + borrowed)
  grossExposure: number;       // |Long| + |Short|
  netExposure: number;         // Long - Short
  netWorth: number;            // Net portfolio value
  leverage: number;            // Gross Exposure / Net Worth
  cashPosition: number;        // Available cash/stablecoins
  cashPercentage: number;      // Cash as % of gross assets
}

/**
 * Professional perps metrics with notional values
 */
export interface ProfessionalPerpsMetrics {
  collateral: number;          // Margin/collateral deposited
  longNotional: number;        // Total long position notional value
  shortNotional: number;       // Total short position notional value
  netNotional: number;         // Long - Short notional
  grossNotional: number;       // |Long| + |Short| notional
  marginUsed: number;          // Estimated margin used (notional / leverage)
  marginAvailable: number;     // Collateral - marginUsed
  utilizationRate: number;     // marginUsed / collateral as %
  unrealizedPnl: number;       // If available from exchange
}

/**
 * Concentration risk metrics
 */
export interface ConcentrationMetrics {
  top1Percentage: number;      // Largest position as % of portfolio
  top5Percentage: number;      // Top 5 positions as % of portfolio
  top10Percentage: number;     // Top 10 positions as % of portfolio
  herfindahlIndex: number;     // HHI for concentration (0-10000)
  positionCount: number;       // Total number of positions
  assetCount: number;          // Unique assets
}

/**
 * Spot vs Derivatives breakdown
 */
export interface SpotDerivativesBreakdown {
  spotLong: number;            // Spot long positions
  spotShort: number;           // Borrowed/debt positions
  spotNet: number;             // Net spot exposure
  derivativesLong: number;     // Perps long notional
  derivativesShort: number;    // Perps short notional
  derivativesNet: number;      // Net derivatives exposure
  derivativesCollateral: number; // Margin for derivatives
}

/**
 * Get the price lookup key for a position
 * For wallet positions, use the DeBank price key (more accurate)
 * For manual positions, use CoinGecko ID mapping
 */
export function getPriceKey(position: Position): string {
  // Wallet positions have a debankPriceKey that points to the accurate price from DeBank
  if (position.debankPriceKey) {
    return position.debankPriceKey;
  }

  // Manual positions use CoinGecko/Finnhub price lookup
  const priceProvider = getPriceProvider();
  return position.type === 'crypto'
    ? priceProvider.getCoinId(position.symbol)
    : position.symbol.toLowerCase();
}

/**
 * Custom price entry for manual price overrides
 */
export interface CustomPrice {
  price: number;
  note?: string;
  setAt: string;
}

/**
 * Calculate value and enriched data for a single position
 * Debt positions have negative value (reduce net worth)
 * Custom prices take precedence over market prices
 */
export function calculatePositionValue(
  position: Position,
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>
): AssetWithPrice {
  // Cash positions always have price = 1 (1 USD = 1 USD)
  if (position.type === 'cash') {
    return {
      ...position,
      currentPrice: 1,
      value: position.amount,
      change24h: 0,
      changePercent24h: 0,
      allocation: 0,
    };
  }

  // Check for custom price first (takes precedence over market price)
  const symbolLower = position.symbol.toLowerCase();
  const customPrice = customPrices?.[symbolLower];
  if (customPrice) {
    const currentPrice = customPrice.price;
    const rawValue = position.amount * currentPrice;
    const value = position.isDebt ? -rawValue : rawValue;

    return {
      ...position,
      currentPrice,
      value,
      change24h: 0,        // No 24h change for custom prices
      changePercent24h: 0, // No 24h change for custom prices
      allocation: 0,
      hasCustomPrice: true, // Flag to indicate custom price is used
    };
  }

  const priceKey = getPriceKey(position);
  let priceData = prices[priceKey];

  // Fallback to CoinGecko price if DeBank price is 0 or missing
  // This helps tokens like SYRUP that DeBank doesn't have prices for
  if ((!priceData || priceData.price === 0) && position.type === 'crypto') {
    const priceProvider = getPriceProvider();
    const coinGeckoKey = priceProvider.getCoinId(position.symbol);
    const coinGeckoData = prices[coinGeckoKey];
    if (coinGeckoData && coinGeckoData.price > 0) {
      priceData = coinGeckoData;
    }
  }

  const currentPrice = priceData?.price || 0;
  // Debt positions have negative value (they reduce your net worth)
  const rawValue = position.amount * currentPrice;
  const value = position.isDebt ? -rawValue : rawValue;

  // For debt positions:
  // - If asset price goes UP, your debt value goes UP = BAD for you = negative impact
  // - So we invert the 24h change for debt positions
  const rawChange24h = (priceData?.change24h || 0) * position.amount;
  const change24h = position.isDebt ? -rawChange24h : rawChange24h;

  // For debt, invert the percentage too (price up = bad for you)
  const rawChangePercent = priceData?.changePercent24h || 0;
  const changePercent24h = position.isDebt ? -rawChangePercent : rawChangePercent;

  return {
    ...position,
    currentPrice,
    value,
    change24h,
    changePercent24h,
    allocation: 0, // Calculated separately when we have total
  };
}

/**
 * Calculate all positions with prices and allocations
 * Returns positions sorted by value (highest first, debts at the end)
 * Custom prices take precedence over market prices when provided
 */
export function calculateAllPositionsWithPrices(
  positions: Position[],
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>
): AssetWithPrice[] {
  // Calculate values for all positions
  const positionsWithPrices = positions.map((p) =>
    calculatePositionValue(p, prices, customPrices)
  );

  // Calculate total gross assets (positive values only, for allocation %)
  const totalGrossAssets = positionsWithPrices
    .filter((p) => p.value > 0)
    .reduce((sum, p) => sum + p.value, 0);

  // Calculate allocations (based on gross assets, not net)
  // Debt positions get negative allocation % to show their relative impact
  positionsWithPrices.forEach((p) => {
    if (totalGrossAssets > 0) {
      p.allocation = (p.value / totalGrossAssets) * 100;
    } else {
      p.allocation = 0;
    }
  });

  // Sort: assets by value descending, then debts by absolute value descending
  return positionsWithPrices.sort((a, b) => {
    // Non-debt positions first
    if (!a.isDebt && b.isDebt) return -1;
    if (a.isDebt && !b.isDebt) return 1;
    // Within same category, sort by absolute value descending
    return Math.abs(b.value) - Math.abs(a.value);
  });
}

/**
 * Calculate comprehensive portfolio summary
 * Custom prices take precedence over market prices when provided
 */
export function calculatePortfolioSummary(
  positions: Position[],
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>
): PortfolioSummary {
  const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices, customPrices);
  const totalValue = assetsWithPrice.reduce((sum, a) => sum + a.value, 0);

  // Calculate total 24h change
  // For debt positions, a.changePercent24h is already inverted (negative when price goes up)
  // So we can simply sum up change24h values which are already correctly signed
  const change24h = assetsWithPrice.reduce((sum, a) => sum + a.change24h, 0);

  // Calculate previous total value properly handling debt
  const previousTotalValue = assetsWithPrice.reduce((sum, a) => {
    if (a.changePercent24h === 0) return sum + a.value;

    // For debt: changePercent24h is already inverted, so we need to un-invert to get actual price change
    const actualPriceChangePercent = a.isDebt ? -a.changePercent24h : a.changePercent24h;
    const previousPrice = a.currentPrice / (1 + actualPriceChangePercent / 100);
    const previousValue = a.amount * previousPrice;

    // Debt positions still have negative impact
    return sum + (a.isDebt ? -previousValue : previousValue);
  }, 0);

  const changePercent24h =
    previousTotalValue !== 0
      ? ((totalValue - previousTotalValue) / Math.abs(previousTotalValue)) * 100
      : 0;

  // Group by type
  const cryptoAssets = assetsWithPrice.filter((a) => a.type === 'crypto');
  const stockAssets = assetsWithPrice.filter((a) => a.type === 'stock');
  const cashAssets = assetsWithPrice.filter((a) => a.type === 'cash');
  const manualAssets = assetsWithPrice.filter((a) => a.type === 'manual');

  const cryptoValue = cryptoAssets.reduce((sum, a) => sum + a.value, 0);
  const stockValue = stockAssets.reduce((sum, a) => sum + a.value, 0);
  const cashValue = cashAssets.reduce((sum, a) => sum + a.value, 0);
  const manualValue = manualAssets.reduce((sum, a) => sum + a.value, 0);

  // Top assets by value (for charts)
  const topAssets = assetsWithPrice.slice(0, 10);

  // Calculate gross assets and total debts
  const grossAssets = assetsWithPrice
    .filter((a) => a.value > 0)
    .reduce((sum, a) => sum + a.value, 0);

  const totalDebts = assetsWithPrice
    .filter((a) => a.value < 0)
    .reduce((sum, a) => sum + Math.abs(a.value), 0);

  // Aggregate unique assets for asset count
  const uniqueAssets = new Set(assetsWithPrice.map(a => a.symbol.toLowerCase()));

  const assetsByType = [
    {
      type: 'crypto' as const,
      value: cryptoValue,
      percentage: grossAssets > 0 ? (Math.max(0, cryptoValue) / grossAssets) * 100 : 0,
    },
    {
      type: 'stock' as const,
      value: stockValue,
      percentage: grossAssets > 0 ? (Math.max(0, stockValue) / grossAssets) * 100 : 0,
    },
    {
      type: 'cash' as const,
      value: cashValue,
      percentage: grossAssets > 0 ? (Math.max(0, cashValue) / grossAssets) * 100 : 0,
    },
    {
      type: 'manual' as const,
      value: manualValue,
      percentage: grossAssets > 0 ? (Math.max(0, manualValue) / grossAssets) * 100 : 0,
    },
  ].filter((t) => t.value !== 0); // Include negative values (net debt in category)

  return {
    totalValue,
    grossAssets,
    totalDebts,
    change24h,
    changePercent24h,
    cryptoValue,
    stockValue,
    cashValue,
    manualValue,
    positionCount: assetsWithPrice.length,
    assetCount: uniqueAssets.size,
    topAssets,
    assetsByType,
  };
}

/**
 * Calculate total NAV from positions (Net Asset Value)
 * Properly handles debt positions by subtracting their value
 */
export function calculateTotalNAV(
  positions: Position[],
  prices: Record<string, PriceData>
): number {
  return positions.reduce((sum, position) => {
    // Cash positions have price = 1
    if (position.type === 'cash') {
      return sum + position.amount;
    }

    const priceKey = getPriceKey(position);
    const price = prices[priceKey]?.price || 0;
    const value = position.amount * price;

    // Debt positions reduce NAV
    return sum + (position.isDebt ? -value : value);
  }, 0);
}

/**
 * Group positions by symbol and aggregate
 * Debt and non-debt positions are kept separate to maintain accuracy
 */
export function aggregatePositionsBySymbol(
  positions: AssetWithPrice[]
): AssetWithPrice[] {
  const assetMap = new Map<string, AssetWithPrice>();

  // Calculate total gross assets for allocation % (positive values only)
  const totalGrossAssets = positions
    .filter((p) => p.value > 0)
    .reduce((sum, p) => sum + p.value, 0);

  positions.forEach((asset) => {
    // Include isDebt in key to keep debt and non-debt positions separate
    const debtSuffix = asset.isDebt ? '-debt' : '';
    const key = `${asset.symbol.toLowerCase()}-${asset.type}${debtSuffix}`;
    const existing = assetMap.get(key);

    if (existing) {
      const newAmount = existing.amount + asset.amount;
      const newValue = existing.value + asset.value;
      assetMap.set(key, {
        ...existing,
        amount: newAmount,
        value: newValue,
        // Allocation based on gross assets, debt shows negative %
        allocation: totalGrossAssets > 0 ? (newValue / totalGrossAssets) * 100 : 0,
      });
    } else {
      assetMap.set(key, {
        ...asset,
        allocation: totalGrossAssets > 0 ? (asset.value / totalGrossAssets) * 100 : 0,
      });
    }
  });

  // Sort: positive values first (descending), then negative values (by absolute value descending)
  return Array.from(assetMap.values()).sort((a, b) => {
    if (a.value >= 0 && b.value < 0) return -1;
    if (a.value < 0 && b.value >= 0) return 1;
    return Math.abs(b.value) - Math.abs(a.value);
  });
}

/**
 * Get set of perp protocols that have active (non-stablecoin) positions
 * Used to determine if stablecoins on perp exchanges should count as margin
 */
export function getPerpProtocolsWithPositions(assets: AssetWithPrice[]): Set<string> {
  const protocols = new Set<string>();

  assets.forEach((asset) => {
    if (asset.protocol && isPerpProtocol(asset.protocol)) {
      const { isPerpTrade } = detectPerpTrade(asset.name);
      if (isPerpTrade) {
        protocols.add(asset.protocol.toLowerCase());
      }
    }
  });

  return protocols;
}

/**
 * Filter assets to get only perp positions (including margin when active)
 * Use this helper instead of duplicating the perp filtering logic
 */
export function filterPerpPositions(assets: AssetWithPrice[]): AssetWithPrice[] {
  const categoryService = getCategoryService();

  return assets.filter((asset) => {
    if (!asset.protocol || !isPerpProtocol(asset.protocol)) return false;

    // Include all positions on perp exchanges:
    // - Stablecoins (margin)
    // - Perp trades (Long/Short)
    // - Spot holdings
    // The perps page will categorize them appropriately
    return true;
  });
}

/**
 * Calculate exposure data by category - SINGLE SOURCE OF TRUTH
 * This function handles:
 * - Hierarchical category classification (main: crypto, stocks, equity, cash, other)
 * - Sub-categories (crypto: btc, eth, sol, stablecoins, tokens, perps; stocks: tech, ai, other)
 * - Debt position handling (subtracts from category totals)
 * - Perps: positions on Hyperliquid, Lighter, Ethereal (as crypto sub-category)
 * - Stablecoins on perp exchanges count as margin (perps) only if there are open positions
 *
 * All components should use this function instead of calculating locally.
 */
export function calculateExposureData(assets: AssetWithPrice[]): ExposureData {
  const categoryService = getCategoryService();

  // Use shared helper to identify active perp protocols
  const perpProtocolsWithPositions = getPerpProtocolsWithPositions(assets);

  // Track values by combined category key (e.g., 'crypto_btc', 'stocks_tech')
  const categoryAssets: Record<string, number> = {};
  const categoryDebts: Record<string, number> = {};

  // Track perps breakdown
  let perpsMargin = 0;
  let perpsLongs = 0;
  let perpsShorts = 0;

  // SECOND PASS: Categorize all assets
  assets.forEach((asset) => {
    const absValue = Math.abs(asset.value);
    const isDebt = asset.isDebt || asset.value < 0;
    const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
    let subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    // Handle perp protocol positions
    if (asset.protocol && isPerpProtocol(asset.protocol)) {
      const protocolKey = asset.protocol.toLowerCase();
      const hasActivePositions = perpProtocolsWithPositions.has(protocolKey);

      // Check if this is an actual perp trade (Long/Short) vs spot holding
      const { isPerpTrade, isLong, isShort } = detectPerpTrade(asset.name);

      if (subCat === 'stablecoins') {
        // ALWAYS count stablecoins on perp exchanges as margin for metrics
        if (!isDebt) perpsMargin += absValue;

        // Only categorize as 'perps' if there are active positions (for portfolio breakdown)
        if (hasActivePositions) {
          subCat = 'perps';
        }
        // else: stays as crypto_stablecoins for categorization but still counted in perpsMargin
      } else if (isPerpTrade) {
        // Actual perp trade (Long/Short position)
        // Use position name to determine long vs short, not value sign
        // (exchanges may report shorts as positive notional values)
        subCat = 'perps';
        if (isShort) {
          perpsShorts += absValue;
        } else {
          perpsLongs += absValue;
        }
      }
      // else: spot holding on perp exchange - stays in its original category (e.g., crypto_tokens)
    }

    // Build the category key
    const catKey = subCat !== 'none' ? `${mainCat}_${subCat}` : mainCat;

    if (!categoryAssets[catKey]) categoryAssets[catKey] = 0;
    if (!categoryDebts[catKey]) categoryDebts[catKey] = 0;

    if (isDebt) {
      categoryDebts[catKey] += absValue;
    } else {
      categoryAssets[catKey] += absValue;
    }
  });

  // Calculate totals
  const grossAssets = Object.values(categoryAssets).reduce((sum, v) => sum + v, 0);
  const totalDebts = Object.values(categoryDebts).reduce((sum, v) => sum + v, 0);
  const totalValue = grossAssets - totalDebts;

  // Build hierarchical category breakdown
  const mainCategories = categoryService.getMainCategories();
  const categories: CategoryBreakdown[] = mainCategories.map((mainCat) => {
    const subCats = categoryService.getSubCategories(mainCat);

    // Build sub-category breakdowns
    const subCategories: SubCategoryBreakdown[] = subCats.map((subCat) => {
      const catKey = `${mainCat}_${subCat}`;
      const gross = categoryAssets[catKey] || 0;
      const debts = categoryDebts[catKey] || 0;
      const net = gross - debts;

      return {
        category: catKey as AssetCategory,
        label: categoryService.getCategoryLabel(catKey as AssetCategory),
        value: net,
        grossAssets: gross,
        debts,
        percentage: 0, // Will calculate after main category total
        color: categoryService.getCategoryColor(catKey as AssetCategory),
      };
    }).filter((sub) => sub.grossAssets > 0 || sub.debts > 0);

    // Calculate main category totals (sum of sub-categories + direct assignments)
    const directGross = categoryAssets[mainCat] || 0;
    const directDebts = categoryDebts[mainCat] || 0;
    const subGross = subCategories.reduce((sum, s) => sum + s.grossAssets, 0);
    const subDebts = subCategories.reduce((sum, s) => sum + s.debts, 0);

    const gross = directGross + subGross;
    const debts = directDebts + subDebts;
    const net = gross - debts;

    // Calculate sub-category percentages relative to main category
    if (net !== 0) {
      subCategories.forEach((sub) => {
        sub.percentage = (sub.value / net) * 100;
      });
    }

    return {
      category: mainCat,
      label: categoryService.getMainCategoryLabel(mainCat),
      value: net,
      grossAssets: gross,
      debts,
      percentage: totalValue > 0 ? (net / totalValue) * 100 : 0,
      color: categoryService.getCategoryColor(mainCat),
      subCategories,
    };
  }).filter((cat) => cat.grossAssets > 0 || cat.debts > 0)
    .sort((a, b) => b.value - a.value);

  // Calculate perps breakdown
  const perpsBreakdown: PerpsBreakdown = {
    margin: perpsMargin,
    longs: perpsLongs,
    shorts: perpsShorts,
    total: (categoryAssets['crypto_perps'] || 0) - (categoryDebts['crypto_perps'] || 0),
  };

  // Calculate simple breakdown for pie chart: Cash & Equivalents, BTC, ETH, Tokens
  const cashValue = ((categoryAssets['cash'] || 0) - (categoryDebts['cash'] || 0)) +
                    ((categoryAssets['crypto_stablecoins'] || 0) - (categoryDebts['crypto_stablecoins'] || 0));
  const btcValue = (categoryAssets['crypto_btc'] || 0) - (categoryDebts['crypto_btc'] || 0);
  const ethValue = (categoryAssets['crypto_eth'] || 0) - (categoryDebts['crypto_eth'] || 0);
  // Tokens = everything else (sol, tokens, perps, stocks, equity, other)
  const tokensValue = totalValue - cashValue - btcValue - ethValue;

  const simpleBreakdownItems: SimpleExposureItem[] = [
    {
      id: 'cash' as const,
      label: 'Cash & Equivalents',
      value: cashValue,
      percentage: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
      color: '#10B981', // green
    },
    {
      id: 'btc' as const,
      label: 'BTC',
      value: btcValue,
      percentage: totalValue > 0 ? (btcValue / totalValue) * 100 : 0,
      color: '#F7931A', // bitcoin orange
    },
    {
      id: 'eth' as const,
      label: 'ETH',
      value: ethValue,
      percentage: totalValue > 0 ? (ethValue / totalValue) * 100 : 0,
      color: '#627EEA', // ethereum blue
    },
    {
      id: 'tokens' as const,
      label: 'Tokens',
      value: tokensValue,
      percentage: totalValue > 0 ? (tokensValue / totalValue) * 100 : 0,
      color: '#8B5CF6', // purple
    },
  ];
  const simpleBreakdown = simpleBreakdownItems
    .filter(item => item.value !== 0)
    .sort((a, b) => b.value - a.value);

  // === PROFESSIONAL INVESTOR METRICS ===

  // Calculate spot exposure by iterating through assets directly (more accurate)
  let spotLongValue = 0;
  let spotShortValue = 0;
  let cashEquivalentsForLeverage = 0; // Stablecoins, Pendle PTs - don't count towards leverage

  assets.forEach((asset) => {
    const isOnPerpExchange = asset.protocol && isPerpProtocol(asset.protocol);
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
    const isDebt = asset.isDebt || asset.value < 0;
    const absValue = Math.abs(asset.value);

    // Check if this is a perp trade (counted separately in perpsLongs/perpsShorts)
    const { isPerpTrade } = detectPerpTrade(asset.name);

    // Handle perp exchange assets:
    // - Stablecoins: skip (margin, counted in perpsMargin)
    // - Perp trades: skip (counted in perpsLongs/perpsShorts)
    // - Spot holdings: count as spot exposure (e.g., holding ETH on Hyperliquid)
    if (isOnPerpExchange) {
      if (subCat === 'stablecoins' || isPerpTrade) {
        return; // Skip margin and perp trades
      }
      // Spot holdings on perp exchanges - fall through to count as spot
    }

    // Check if this is a cash equivalent (stablecoins, Pendle PTs)
    // Pendle PTs are fixed-term deposits that mature to a known value - no market risk
    // PT symbols start with 'pt-' (e.g., PT-sUSDe-27MAR2025, PT-weETH-26JUN2025)
    // Note: YT (Yield Tokens) are NOT cash equivalents as they have yield risk
    const symbolLower = asset.symbol.toLowerCase();
    const isPendlePT = symbolLower.startsWith('pt-') || symbolLower.startsWith('pt_');
    const isCashEquivalent = subCat === 'stablecoins' || isPendlePT;

    if (isDebt) {
      spotShortValue += absValue;
    } else {
      spotLongValue += absValue;
      if (isCashEquivalent) {
        cashEquivalentsForLeverage += absValue;
      }
    }
  });

  // Exposure Metrics
  // Exclude cash equivalents (stablecoins, Pendle PTs) as they don't add market risk
  const spotLong = spotLongValue;
  const spotShort = spotShortValue;

  // Risk-adjusted exposure: excludes cash equivalents that don't have market risk
  const riskAdjustedSpotLong = spotLong - cashEquivalentsForLeverage;
  const longExposure = riskAdjustedSpotLong + perpsLongs;  // Market-exposed long positions
  const shortExposure = spotShort + perpsShorts; // All short positions (including borrowed)
  const grossExposure = longExposure + shortExposure;
  const netExposure = longExposure - shortExposure;

  // Leverage = Gross Exposure / Net Worth
  const leverage = totalValue > 0 ? grossExposure / totalValue : 0;

  // Debug logging for exposure calculation
  console.log('[EXPOSURE] Calculation breakdown:', {
    spotLong: spotLong.toFixed(2),
    spotShort: spotShort.toFixed(2),
    cashEquivalents: cashEquivalentsForLeverage.toFixed(2),
    riskAdjustedSpotLong: riskAdjustedSpotLong.toFixed(2),
    perpsLongs: perpsLongs.toFixed(2),
    perpsShorts: perpsShorts.toFixed(2),
    perpsMargin: perpsMargin.toFixed(2),
    longExposure: longExposure.toFixed(2),
    shortExposure: shortExposure.toFixed(2),
    grossExposure: grossExposure.toFixed(2),
    netExposure: netExposure.toFixed(2),
    netWorth: totalValue.toFixed(2),
    leverage: leverage.toFixed(2),
  });

  // Log assets contributing to short exposure to help debug
  if (spotShort > 0 || perpsShorts > 0) {
    console.log('[EXPOSURE] Short positions breakdown:');
    assets.forEach((asset) => {
      const isOnPerpExchange = asset.protocol && isPerpProtocol(asset.protocol);
      const isDebt = asset.isDebt || asset.value < 0;
      const { isShort } = detectPerpTrade(asset.name);
      const absValue = Math.abs(asset.value);

      // Check if it's a perp short (counted in perpsShorts)
      if (isOnPerpExchange && isShort) {
        console.log(`  [PERP SHORT] ${asset.symbol}: $${absValue.toFixed(2)} - ${asset.name}`);
      }
      // Check if it's a spot short (counted in spotShort)
      else if (isDebt && !isOnPerpExchange) {
        console.log(`  [SPOT SHORT] ${asset.symbol}: $${absValue.toFixed(2)} - ${asset.name} (isDebt: ${asset.isDebt}, value: ${asset.value.toFixed(2)})`);
      }
    });
  }

  const exposureMetrics: ExposureMetrics = {
    longExposure,
    shortExposure,
    grossExposure,
    netExposure,
    netWorth: totalValue,
    leverage,
    cashPosition: cashValue,
    cashPercentage: grossAssets > 0 ? (Math.max(0, cashValue) / grossAssets) * 100 : 0,
  };

  // Professional Perps Metrics
  const grossPerpsNotional = perpsLongs + perpsShorts;
  const netPerpsNotional = perpsLongs - perpsShorts;
  // Estimate margin used assuming average 10x leverage available
  const estimatedMarginUsed = grossPerpsNotional / 10;
  const marginAvailable = Math.max(0, perpsMargin - estimatedMarginUsed);
  const utilizationRate = perpsMargin > 0 ? (estimatedMarginUsed / perpsMargin) * 100 : 0;

  const perpsMetrics: ProfessionalPerpsMetrics = {
    collateral: perpsMargin,
    longNotional: perpsLongs,
    shortNotional: perpsShorts,
    netNotional: netPerpsNotional,
    grossNotional: grossPerpsNotional,
    marginUsed: estimatedMarginUsed,
    marginAvailable,
    utilizationRate: Math.min(100, utilizationRate),
    unrealizedPnl: 0, // Would need exchange API data
  };

  // Concentration Metrics - calculate from positive (long) positions only
  // Concentration risk is about how concentrated your long exposure is
  const positiveAssets = assets.filter(a => a.value > 0);
  const sortedAssetValues = positiveAssets
    .map(a => a.value)
    .sort((a, b) => b - a);

  const top1Value = sortedAssetValues[0] || 0;
  const top5Value = sortedAssetValues.slice(0, 5).reduce((sum, v) => sum + v, 0);
  const top10Value = sortedAssetValues.slice(0, 10).reduce((sum, v) => sum + v, 0);

  // Herfindahl-Hirschman Index (HHI) for concentration
  // HHI = sum of squared market shares (0-10000 scale)
  // Lower is more diversified: 0 = perfect diversification, 10000 = single position
  const hhi = grossAssets > 0
    ? sortedAssetValues.reduce((sum, v) => {
        const share = (v / grossAssets) * 100;
        return sum + share * share;
      }, 0)
    : 0;

  const concentrationMetrics: ConcentrationMetrics = {
    top1Percentage: grossAssets > 0 ? (top1Value / grossAssets) * 100 : 0,
    top5Percentage: grossAssets > 0 ? (top5Value / grossAssets) * 100 : 0,
    top10Percentage: grossAssets > 0 ? (top10Value / grossAssets) * 100 : 0,
    herfindahlIndex: Math.round(hhi),
    positionCount: positiveAssets.length, // Count of long positions (for concentration)
    assetCount: new Set(positiveAssets.map(a => a.symbol.toLowerCase())).size,
  };

  // Spot vs Derivatives Breakdown
  const spotDerivatives: SpotDerivativesBreakdown = {
    spotLong,
    spotShort,
    spotNet: spotLong - spotShort,
    derivativesLong: perpsLongs,
    derivativesShort: perpsShorts,
    derivativesNet: netPerpsNotional,
    derivativesCollateral: perpsMargin,
  };

  return {
    categories,
    perpsBreakdown,
    totalValue,
    grossAssets,
    totalDebts,
    simpleBreakdown,
    exposureMetrics,
    perpsMetrics,
    concentrationMetrics,
    spotDerivatives,
  };
}
