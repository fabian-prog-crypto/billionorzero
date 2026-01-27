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
 * Asset exposure classification types
 */
export type ExposureClassification =
  | 'perp-long'      // Perp long position (notional exposure)
  | 'perp-short'     // Perp short position (notional exposure)
  | 'perp-margin'    // Stablecoin margin on perp exchange
  | 'spot-long'      // Regular long exposure (crypto, stocks, etc.)
  | 'spot-short'     // Borrowed CRYPTO (actual short exposure - you're short the asset)
  | 'cash'           // Cash equivalents (stablecoins, Pendle PTs)
  | 'perp-spot'      // Spot holdings on perp exchange (not margin, not perp trade)
  | 'borrowed-cash'; // Borrowed stablecoins (NOT short exposure - just leverage)

/**
 * Classify an asset for exposure calculation
 * SINGLE SOURCE OF TRUTH for how each position is categorized
 */
export function classifyAssetExposure(
  asset: AssetWithPrice,
  categoryService: ReturnType<typeof getCategoryService>
): { classification: ExposureClassification; absValue: number } {
  const isOnPerpExchange = asset.protocol ? isPerpProtocol(asset.protocol) : false;
  const isDebt = asset.isDebt || asset.value < 0;
  const absValue = Math.abs(asset.value);
  const { isPerpTrade, isShort } = detectPerpTrade(asset.name);
  const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

  // Check if cash equivalent (stablecoins, Pendle PTs)
  const symbolLower = asset.symbol.toLowerCase();
  const isPendlePT = symbolLower.startsWith('pt-') || symbolLower.startsWith('pt_');
  const isCashEquivalent = subCat === 'stablecoins' || isPendlePT;

  // Handle perp exchange positions
  if (isOnPerpExchange) {
    if (isPerpTrade) {
      return {
        classification: isShort ? 'perp-short' : 'perp-long',
        absValue,
      };
    }
    if (subCat === 'stablecoins') {
      return { classification: 'perp-margin', absValue };
    }
    // Spot holdings on perp exchange (e.g., holding ETH on Hyperliquid)
    return { classification: 'perp-spot', absValue };
  }

  // Not on perp exchange
  if (isCashEquivalent) {
    if (isDebt) {
      // Borrowed stablecoins (e.g., borrowing USDC from Morpho/Aave)
      // This is NOT short exposure - it's just leverage
      // You're not betting against the dollar, you're borrowing to invest elsewhere
      return { classification: 'borrowed-cash', absValue };
    }
    return { classification: 'cash', absValue };
  }

  // Non-stablecoin positions
  if (isDebt) {
    // Borrowed crypto (e.g., borrowing ETH from Morpho/Aave)
    // This IS short exposure - if you borrow ETH and it goes up, you owe more
    return { classification: 'spot-short', absValue };
  }

  return { classification: 'spot-long', absValue };
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
 * Breakdown item for detailed tooltips
 */
export interface BreakdownItem {
  label: string;
  value: number;
}

/**
 * Allocation breakdown item (Cash & Equivalents, Crypto, Equities)
 */
export interface AllocationBreakdownItem {
  label: string;
  value: number;
  percentage: number;
  color: string;
  breakdown: BreakdownItem[];
}

/**
 * Risk profile breakdown item (Conservative, Moderate, Aggressive)
 */
export interface RiskProfileItem {
  label: 'Conservative' | 'Moderate' | 'Aggressive';
  value: number;
  percentage: number;
  color: string;
  breakdown: BreakdownItem[];
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
  debtRatio: number;           // Total debts / Gross assets as %
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
 * - Hierarchical category classification (main: crypto, stocks, cash, other)
 * - Sub-categories (crypto: btc, eth, sol, stablecoins, tokens, perps; stocks: tech, ai, other)
 * - Debt position handling (subtracts from category totals)
 * - Perps: positions on Hyperliquid, Lighter, Ethereal (as crypto sub-category)
 * - Stablecoins on perp exchanges count as margin (perps) only if there are open positions
 *
 * All components should use this function instead of calculating locally.
 */
/**
 * Custody breakdown item
 */
export interface CustodyBreakdownItem {
  label: string;
  value: number;
  percentage: number;
  color: string;
  breakdown: BreakdownItem[];
}

/**
 * Chain breakdown item
 */
export interface ChainBreakdownItem {
  chain: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

/**
 * Crypto metrics for display
 */
export interface CryptoMetrics {
  stablecoinRatio: number;
  btcDominance: number;
  ethDominance: number;
  defiExposure: number;
}

/**
 * Crypto allocation item for horizontal bar display
 */
export interface CryptoAllocationItem {
  category: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

// Chain colors mapping
const CHAIN_COLORS: Record<string, string> = {
  eth: '#627EEA',
  ethereum: '#627EEA',
  arb: '#28A0F0',
  arbitrum: '#28A0F0',
  op: '#FF0420',
  optimism: '#FF0420',
  base: '#0052FF',
  bsc: '#F0B90B',
  matic: '#8247E5',
  polygon: '#8247E5',
  avax: '#E84142',
  sol: '#9945FF',
  solana: '#9945FF',
  ftm: '#1969FF',
  fantom: '#1969FF',
  cro: '#002D74',
  cronos: '#002D74',
  gnosis: '#04795B',
  linea: '#61DFFF',
  scroll: '#FFEEDA',
  zksync: '#8C8DFC',
  manta: '#000000',
  blast: '#FCFC03',
  mode: '#DFFE00',
  uni: '#FF007A',
  unichain: '#FF007A',
};

// Custody type colors
const CUSTODY_COLORS: Record<string, string> = {
  'Self-Custody': '#4CAF50',
  'DeFi': '#9C27B0',
  'CEX': '#FF9800',
  'Banks & Brokers': '#2196F3',
  'Manual': '#607D8B',
};

/**
 * Calculate custody breakdown - SINGLE SOURCE OF TRUTH
 * Categories: Self-Custody, DeFi, CEX, Banks & Brokers, Manual
 * Uses GROSS ASSETS only - debt doesn't count toward custody allocation
 */
export function calculateCustodyBreakdown(assets: AssetWithPrice[]): CustodyBreakdownItem[] {
  const custodyMap: Record<string, { value: number; positions: Map<string, number> }> = {
    'Self-Custody': { value: 0, positions: new Map() },
    'DeFi': { value: 0, positions: new Map() },
    'CEX': { value: 0, positions: new Map() },
    'Banks & Brokers': { value: 0, positions: new Map() },
    'Manual': { value: 0, positions: new Map() },
  };

  // Only process ASSETS (positive values) - debt doesn't contribute to custody allocation
  const grossAssets = assets.filter(a => a.value > 0);

  grossAssets.forEach((asset) => {
    const value = asset.value; // Already positive
    const symbolKey = asset.symbol.toUpperCase();
    let category: string;

    if (asset.protocol?.startsWith('cex:')) {
      category = 'CEX';
    } else if (asset.type === 'stock' || asset.type === 'cash') {
      category = 'Banks & Brokers';
    } else if (asset.walletAddress) {
      if (asset.protocol && asset.protocol !== 'wallet') {
        category = 'DeFi';
      } else {
        category = 'Self-Custody';
      }
    } else {
      category = 'Manual';
    }

    custodyMap[category].value += value;
    custodyMap[category].positions.set(
      symbolKey,
      (custodyMap[category].positions.get(symbolKey) || 0) + value
    );
  });

  const total = Object.values(custodyMap).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(custodyMap)
    .filter(([_, item]) => item.value > 0)
    .map(([label, item]) => ({
      label,
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: CUSTODY_COLORS[label] || '#6B7280',
      breakdown: Array.from(item.positions.entries())
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate chain breakdown
 */
/**
 * Uses GROSS ASSETS only - debt doesn't count toward chain allocation
 */
export function calculateChainBreakdown(assets: AssetWithPrice[]): ChainBreakdownItem[] {
  const chainMap: Record<string, number> = {};

  // Only process ASSETS (positive values)
  const grossAssets = assets.filter(a => a.value > 0);

  grossAssets.forEach((asset) => {
    const value = asset.value; // Already positive
    let chain = 'Other';

    if (asset.protocol?.startsWith('cex:')) {
      // CEX positions - use exchange name
      const exchange = asset.protocol.replace('cex:', '');
      chain = exchange.charAt(0).toUpperCase() + exchange.slice(1);
    } else if (asset.chain) {
      // On-chain positions
      chain = asset.chain.charAt(0).toUpperCase() + asset.chain.slice(1);
    } else if (asset.protocol && isPerpProtocol(asset.protocol)) {
      // Perp protocols
      chain = asset.protocol.charAt(0).toUpperCase() + asset.protocol.slice(1);
    }

    chainMap[chain] = (chainMap[chain] || 0) + value;
  });

  const total = Object.values(chainMap).reduce((sum, v) => sum + v, 0);

  return Object.entries(chainMap)
    .filter(([_, value]) => value > 0)
    .map(([chain, value]) => ({
      chain: chain.toLowerCase(),
      label: chain,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: CHAIN_COLORS[chain.toLowerCase()] || '#6B7280',
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate crypto-specific metrics
 * IMPORTANT: Uses GROSS ASSETS only (positive values) to avoid debt inflating metrics
 * Debt positions are tracked separately and don't contribute to dominance/ratio calculations
 */
export function calculateCryptoMetrics(assets: AssetWithPrice[]): CryptoMetrics {
  const categoryService = getCategoryService();

  // Filter to crypto only
  const cryptoAssets = assets.filter((a) => {
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    return mainCat === 'crypto';
  });

  // Use GROSS ASSETS only (positive values) - debt should not inflate metrics
  // Example: $100k USDC held + $50k USDC borrowed should show ratio based on $100k, not $150k
  const cryptoGrossAssets = cryptoAssets.filter(a => a.value > 0);
  const totalCryptoValue = cryptoGrossAssets.reduce((sum, a) => sum + a.value, 0);

  if (totalCryptoValue === 0) {
    return { stablecoinRatio: 0, btcDominance: 0, ethDominance: 0, defiExposure: 0 };
  }

  // Calculate metrics from ASSETS only (not debt)
  let stablecoinValue = 0;
  let btcValue = 0;
  let ethValue = 0;
  let defiValue = 0;

  cryptoGrossAssets.forEach((asset) => {
    const value = asset.value; // Already positive since we filtered
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    if (subCat === 'stablecoins') {
      stablecoinValue += value;
    }
    if (subCat === 'btc') {
      btcValue += value;
    }
    if (subCat === 'eth') {
      ethValue += value;
    }
    if (asset.protocol && asset.protocol !== 'wallet' && !asset.protocol.startsWith('cex:')) {
      defiValue += value;
    }
  });

  return {
    stablecoinRatio: (stablecoinValue / totalCryptoValue) * 100,
    btcDominance: (btcValue / totalCryptoValue) * 100,
    ethDominance: (ethValue / totalCryptoValue) * 100,
    defiExposure: (defiValue / totalCryptoValue) * 100,
  };
}

/**
 * Calculate crypto allocation for horizontal bar display
 * Uses GROSS ASSETS only - debt positions don't contribute to allocation %
 */
export function calculateCryptoAllocation(assets: AssetWithPrice[]): CryptoAllocationItem[] {
  const categoryService = getCategoryService();

  // Filter to crypto ASSETS only (positive values) - debt doesn't count toward allocation
  const cryptoAssets = assets.filter((a) => {
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    return mainCat === 'crypto' && a.value > 0;
  });

  const allocationMap: Record<string, { value: number; color: string }> = {};

  const categoryColors: Record<string, string> = {
    btc: '#F7931A',
    eth: '#627EEA',
    sol: '#9945FF',
    stablecoins: '#4CAF50',
    tokens: '#00BCD4',
    perps: '#FF5722',
  };

  const categoryLabels: Record<string, string> = {
    btc: 'BTC',
    eth: 'ETH',
    sol: 'SOL',
    stablecoins: 'Stablecoins',
    tokens: 'Tokens',
    perps: 'Perps',
  };

  cryptoAssets.forEach((asset) => {
    const value = asset.value; // Already positive since we filtered
    let subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    // Check if it's a perp position
    if (asset.protocol && isPerpProtocol(asset.protocol)) {
      const { isPerpTrade } = detectPerpTrade(asset.name);
      if (isPerpTrade) {
        subCat = 'perps';
      }
    }

    if (!allocationMap[subCat]) {
      allocationMap[subCat] = {
        value: 0,
        color: categoryColors[subCat] || '#6B7280',
      };
    }
    allocationMap[subCat].value += value;
  });

  const totalValue = Object.values(allocationMap).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(allocationMap)
    .filter(([_, item]) => item.value > 0)
    .map(([category, item]) => ({
      category,
      label: categoryLabels[category] || category,
      value: item.value,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
      color: item.color,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate exposure breakdown for donut chart (Stablecoins, ETH, DeFi, BTC, etc.)
 */
/**
 * Uses GROSS ASSETS only - debt doesn't count toward exposure allocation
 */
export function calculateExposureBreakdown(assets: AssetWithPrice[]): CryptoAllocationItem[] {
  const categoryService = getCategoryService();

  // Filter to crypto ASSETS only (positive values) - debt doesn't count toward exposure
  const cryptoAssets = assets.filter((a) => {
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    return mainCat === 'crypto' && a.value > 0;
  });

  const exposureMap: Record<string, { value: number; color: string; label: string }> = {};

  const categoryConfig: Record<string, { color: string; label: string }> = {
    stablecoins: { color: '#4CAF50', label: 'Stablecoins' },
    eth: { color: '#627EEA', label: 'ETH' },
    btc: { color: '#F7931A', label: 'BTC' },
    sol: { color: '#9945FF', label: 'SOL' },
    tokens: { color: '#00BCD4', label: 'Tokens' },
    defi: { color: '#9C27B0', label: 'DeFi' },
    rwa: { color: '#795548', label: 'RWA' },
    privacy: { color: '#37474F', label: 'Privacy' },
    ai: { color: '#2196F3', label: 'AI' },
    other: { color: '#6B7280', label: 'Other' },
  };

  cryptoAssets.forEach((asset) => {
    const value = asset.value; // Already positive since we filtered
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    // Map to exposure categories
    let exposureCat: string = subCat;
    if (!categoryConfig[exposureCat]) {
      exposureCat = 'other';
    }

    if (!exposureMap[exposureCat]) {
      const config = categoryConfig[exposureCat] || categoryConfig.other;
      exposureMap[exposureCat] = {
        value: 0,
        color: config.color,
        label: config.label,
      };
    }
    exposureMap[exposureCat].value += value;
  });

  const totalValue = Object.values(exposureMap).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(exposureMap)
    .filter(([_, item]) => item.value > 0)
    .map(([category, item]) => ({
      category,
      label: item.label,
      value: item.value,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
      color: item.color,
    }))
    .sort((a, b) => b.value - a.value);
}

export function calculateExposureData(assets: AssetWithPrice[]): ExposureData {
  const categoryService = getCategoryService();

  // Use shared helper to identify active perp protocols
  const perpProtocolsWithPositions = getPerpProtocolsWithPositions(assets);

  // Track values by combined category key (e.g., 'crypto_btc', 'stocks_tech')
  const categoryAssets: Record<string, number> = {};
  const categoryDebts: Record<string, number> = {};

  // === SINGLE PASS: Classify and track all values ===
  // Exposure metrics (for professional investor view)
  let perpsMargin = 0;
  let perpsLongs = 0;
  let perpsShorts = 0;
  let spotLongValue = 0;
  let spotShortValue = 0;
  let cashEquivalentsForLeverage = 0;

  // Debug: track classifications for logging
  const classificationCounts: Record<ExposureClassification, number> = {
    'perp-long': 0, 'perp-short': 0, 'perp-margin': 0,
    'spot-long': 0, 'spot-short': 0, 'cash': 0, 'perp-spot': 0,
    'borrowed-cash': 0,
  };

  assets.forEach((asset) => {
    const { classification, absValue } = classifyAssetExposure(asset, categoryService);
    const isDebt = asset.isDebt || asset.value < 0;
    const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
    let subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    // Track exposure metrics based on classification
    classificationCounts[classification]++;

    switch (classification) {
      case 'perp-long':
        perpsLongs += absValue;
        subCat = 'perps'; // Override for category breakdown
        break;
      case 'perp-short':
        perpsShorts += absValue;
        subCat = 'perps'; // Override for category breakdown
        break;
      case 'perp-margin':
        perpsMargin += absValue;
        // Only show as 'perps' in category if there are active positions
        const protocolKey = asset.protocol?.toLowerCase() || '';
        if (perpProtocolsWithPositions.has(protocolKey)) {
          subCat = 'perps';
        }
        // Cash on perp exchange counts towards cash equivalents
        cashEquivalentsForLeverage += absValue;
        break;
      case 'perp-spot':
        // Spot holdings on perp exchange - count as regular spot exposure
        if (isDebt) {
          spotShortValue += absValue;
        } else {
          spotLongValue += absValue;
        }
        break;
      case 'spot-long':
        spotLongValue += absValue;
        break;
      case 'spot-short':
        spotShortValue += absValue;
        break;
      case 'cash':
        // Stablecoins and PTs do NOT count as spot long exposure
        // They have no market risk - only count towards cash equivalents
        cashEquivalentsForLeverage += absValue;
        break;
      case 'borrowed-cash':
        // Borrowed stablecoins (e.g., borrowing USDC from Morpho/Aave)
        // This is NOT short exposure - just leverage
        // The debt still affects net worth but doesn't count as "short" position
        // Don't add to spotShortValue - it's not a directional bet against USD
        break;
    }

    // Build the category key for breakdown
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

    // Calculate sub-category percentages relative to main category's gross assets
    // Using gross (not net) gives cleaner percentages that sum to ~100%
    if (gross > 0) {
      subCategories.forEach((sub) => {
        sub.percentage = (sub.grossAssets / gross) * 100;
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
  // Total = margin + net position value (longs - shorts)
  // This represents the actual economic value of the perps position
  const perpsBreakdown: PerpsBreakdown = {
    margin: perpsMargin,
    longs: perpsLongs,
    shorts: perpsShorts,
    total: perpsMargin + perpsLongs - perpsShorts,
  };

  // Calculate simple breakdown for pie chart: Cash & Equivalents, BTC, ETH, Tokens
  const cashValue = ((categoryAssets['cash'] || 0) - (categoryDebts['cash'] || 0)) +
                    ((categoryAssets['crypto_stablecoins'] || 0) - (categoryDebts['crypto_stablecoins'] || 0));
  const btcValue = (categoryAssets['crypto_btc'] || 0) - (categoryDebts['crypto_btc'] || 0);
  const ethValue = (categoryAssets['crypto_eth'] || 0) - (categoryDebts['crypto_eth'] || 0);
  // Tokens = everything else (sol, tokens, perps, stocks, other)
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
      color: '#22D3EE', // cyan
    },
  ];
  const simpleBreakdown = simpleBreakdownItems
    .filter(item => item.value !== 0)
    .sort((a, b) => b.value - a.value);

  // === PROFESSIONAL INVESTOR METRICS ===
  // (Values already calculated in single pass above)

  // Exposure Metrics
  // spotLongValue already excludes cash/stablecoins/PTs (they go to cashEquivalentsForLeverage)
  const spotLong = spotLongValue;
  const spotShort = spotShortValue;

  // Long exposure = spot positions with market risk + perp longs
  // Cash/stablecoins are already excluded from spotLongValue
  const longExposure = Math.max(0, spotLong + perpsLongs);  // Market-exposed long positions
  const shortExposure = Math.max(0, spotShort + perpsShorts); // All short positions (borrowed crypto + perp shorts)
  const grossExposure = longExposure + shortExposure; // Always positive (|Long| + |Short|)
  const netExposure = longExposure - shortExposure;

  // Leverage = Gross Exposure / Net Worth
  const leverage = totalValue > 0 ? grossExposure / totalValue : 0;

  const exposureMetrics: ExposureMetrics = {
    longExposure,
    shortExposure,
    grossExposure,
    netExposure,
    netWorth: totalValue,
    leverage,
    cashPosition: cashValue,
    cashPercentage: grossAssets > 0 ? (Math.max(0, cashValue) / grossAssets) * 100 : 0,
    debtRatio: grossAssets > 0 ? (totalDebts / grossAssets) * 100 : 0,
  };

  // Professional Perps Metrics
  const grossPerpsNotional = perpsLongs + perpsShorts;
  const netPerpsNotional = perpsLongs - perpsShorts;

  // Estimate margin used - this is approximate since actual margin requirements
  // vary by exchange, asset, position size, and account tier.
  // Using 5x as a conservative estimate (20% margin requirement) rather than
  // 10x or higher, since many altcoins have lower max leverage.
  // Real margin data would require exchange API integration.
  const ESTIMATED_AVERAGE_LEVERAGE = 5;
  const estimatedMarginUsed = grossPerpsNotional / ESTIMATED_AVERAGE_LEVERAGE;
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

  // Concentration Metrics - calculate from AGGREGATED assets (not individual positions)
  // If you have 10 ETH positions across wallets, that's still 100% ETH concentration
  const positiveAssets = assets.filter(a => a.value > 0);

  // Aggregate by symbol to get true asset concentration
  const aggregatedBySymbol = new Map<string, number>();
  positiveAssets.forEach(a => {
    const key = a.symbol.toLowerCase();
    aggregatedBySymbol.set(key, (aggregatedBySymbol.get(key) || 0) + a.value);
  });

  // Sort aggregated values for concentration calculation
  const sortedAggregatedValues = Array.from(aggregatedBySymbol.values())
    .sort((a, b) => b - a);

  const top1Value = sortedAggregatedValues[0] || 0;
  const top5Value = sortedAggregatedValues.slice(0, 5).reduce((sum, v) => sum + v, 0);
  const top10Value = sortedAggregatedValues.slice(0, 10).reduce((sum, v) => sum + v, 0);

  // Herfindahl-Hirschman Index (HHI) for concentration
  // HHI = sum of squared market shares (0-10000 scale)
  // Lower is more diversified: 0 = perfect diversification, 10000 = single position
  // Calculate from aggregated assets for true concentration measure
  const hhi = grossAssets > 0
    ? sortedAggregatedValues.reduce((sum, v) => {
        const share = (v / grossAssets) * 100;
        return sum + share * share;
      }, 0)
    : 0;

  const concentrationMetrics: ConcentrationMetrics = {
    top1Percentage: grossAssets > 0 ? (top1Value / grossAssets) * 100 : 0,
    top5Percentage: grossAssets > 0 ? (top5Value / grossAssets) * 100 : 0,
    top10Percentage: grossAssets > 0 ? (top10Value / grossAssets) * 100 : 0,
    herfindahlIndex: Math.round(hhi),
    positionCount: positiveAssets.length, // Count of individual positions
    assetCount: aggregatedBySymbol.size,  // Count of unique assets
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

/**
 * Calculate allocation breakdown - SINGLE SOURCE OF TRUTH
 * Categories: Cash & Equivalents (cash + stablecoins), Crypto (non-stablecoins), Equities
 * Uses GROSS ASSETS only - debt doesn't count toward allocation percentages
 */
export function calculateAllocationBreakdown(assets: AssetWithPrice[]): AllocationBreakdownItem[] {
  const categoryService = getCategoryService();
  const allocationMap: Record<string, { value: number; color: string; positions: Map<string, number> }> = {
    'Cash & Equivalents': { value: 0, color: '#4CAF50', positions: new Map() },
    'Crypto': { value: 0, color: '#FF9800', positions: new Map() },
    'Equities': { value: 0, color: '#F44336', positions: new Map() },
  };

  // Only process ASSETS (positive values) - debt doesn't contribute to allocation
  const grossAssets = assets.filter(a => a.value > 0);

  grossAssets.forEach((asset) => {
    const value = asset.value; // Already positive
    const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
    const symbolKey = asset.symbol.toUpperCase();

    if (mainCat === 'cash') {
      allocationMap['Cash & Equivalents'].value += value;
      allocationMap['Cash & Equivalents'].positions.set(
        symbolKey,
        (allocationMap['Cash & Equivalents'].positions.get(symbolKey) || 0) + value
      );
    } else if (mainCat === 'crypto') {
      const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
      if (subCat === 'stablecoins') {
        allocationMap['Cash & Equivalents'].value += value;
        allocationMap['Cash & Equivalents'].positions.set(
          symbolKey,
          (allocationMap['Cash & Equivalents'].positions.get(symbolKey) || 0) + value
        );
      } else {
        allocationMap['Crypto'].value += value;
        allocationMap['Crypto'].positions.set(
          symbolKey,
          (allocationMap['Crypto'].positions.get(symbolKey) || 0) + value
        );
      }
    } else if (mainCat === 'equities') {
      allocationMap['Equities'].value += value;
      allocationMap['Equities'].positions.set(
        symbolKey,
        (allocationMap['Equities'].positions.get(symbolKey) || 0) + value
      );
    }
  });

  const total = Object.values(allocationMap).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(allocationMap)
    .filter(([_, item]) => item.value > 0)
    .map(([label, item]) => ({
      label,
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: item.color,
      breakdown: Array.from(item.positions.entries())
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate risk profile breakdown - SINGLE SOURCE OF TRUTH
 * Conservative: Cash, stablecoins
 * Moderate: Large cap crypto (BTC, ETH), equities
 * Aggressive: Altcoins, DeFi tokens, perps
 * Uses GROSS ASSETS only - debt doesn't count toward risk profile allocation
 */
export function calculateRiskProfile(assets: AssetWithPrice[]): RiskProfileItem[] {
  const categoryService = getCategoryService();
  const riskMap: Record<string, { value: number; color: string; positions: Map<string, number> }> = {
    'Conservative': { value: 0, color: '#4CAF50', positions: new Map() },
    'Moderate': { value: 0, color: '#2196F3', positions: new Map() },
    'Aggressive': { value: 0, color: '#F44336', positions: new Map() },
  };

  // Only process ASSETS (positive values) - debt doesn't contribute to risk allocation
  const grossAssets = assets.filter(a => a.value > 0);

  grossAssets.forEach((asset) => {
    const value = asset.value; // Already positive
    const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
    const symbolKey = asset.symbol.toUpperCase();
    let category: string;

    // Conservative: Cash, stablecoins
    if (mainCat === 'cash' || subCat === 'stablecoins') {
      category = 'Conservative';
    }
    // Moderate: Large cap crypto (BTC, ETH), blue chip stocks/ETFs
    else if (subCat === 'btc' || subCat === 'eth' || mainCat === 'equities') {
      category = 'Moderate';
    }
    // Aggressive: Altcoins, DeFi, perps, other tokens
    else {
      category = 'Aggressive';
    }

    riskMap[category].value += value;
    riskMap[category].positions.set(
      symbolKey,
      (riskMap[category].positions.get(symbolKey) || 0) + value
    );
  });

  const total = Object.values(riskMap).reduce((sum, item) => sum + item.value, 0);

  return Object.entries(riskMap)
    .filter(([_, item]) => item.value > 0)
    .map(([label, item]) => ({
      label: label as 'Conservative' | 'Moderate' | 'Aggressive',
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: item.color,
      breakdown: Array.from(item.positions.entries())
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}
