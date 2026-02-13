/**
 * Portfolio Calculator - Domain Service
 * Pure business logic for portfolio calculations
 */

import { Position, PriceData, AssetWithPrice, PortfolioSummary, AssetClass, AssetType, Account, WalletAccount, CexAccount, WalletConnection, DataSourceType, assetClassFromType } from '@/types';
import { getPriceProvider } from '../providers';
import {
  CRYPTO_COLORS,
  SUBCATEGORY_COLORS,
  DEFAULT_COLOR,
} from '@/lib/colors';
import {
  AssetCategory,
  MainCategory,
  getAssetCategory,
  getMainCategory,
  getCategoryLabel,
  isPerpProtocol,
  getCategoryService,
  getExposureCategoryConfig,
} from './category-service';

const getCryptoSubCategoryColor = (subCategory: string): string =>
  CRYPTO_COLORS[subCategory as keyof typeof CRYPTO_COLORS] ?? DEFAULT_COLOR;

/**
 * Build a lookup map from account ID to Account for efficient repeated access.
 * Returns undefined if no accounts are provided.
 */
function buildAccountMap(accounts?: Account[]): Map<string, Account> | undefined {
  if (!accounts || accounts.length === 0) return undefined;
  const map = new Map<string, Account>();
  for (const a of accounts) {
    map.set(a.id, a);
  }
  return map;
}

/**
 * Look up the connection data source for a position's accountId.
 * Returns the DataSourceType ('debank' | 'helius' | 'binance' | 'manual' | ...) or undefined.
 */
function getConnectionDataSource(
  accountId: string | undefined,
  accountMap?: Map<string, Account>
): DataSourceType | undefined {
  if (!accountId || !accountMap) return undefined;
  return accountMap.get(accountId)?.connection.dataSource;
}

/**
 * @deprecated Use getConnectionDataSource instead. Kept for backward compatibility during transition.
 * Look up the legacy account type for a position's accountId.
 * Maps new connection dataSource to legacy AccountType equivalents.
 */
function getAccountType(
  accountId: string | undefined,
  accountMap?: Map<string, Account>
): 'wallet' | 'brokerage' | 'cash' | 'cex' | undefined {
  const ds = getConnectionDataSource(accountId, accountMap);
  if (!ds) return undefined;
  switch (ds) {
    case 'debank':
    case 'helius':
      return 'wallet';
    case 'binance':
    case 'coinbase':
    case 'kraken':
    case 'okx':
      return 'cex';
    case 'manual':
      return 'brokerage';
    default:
      return undefined;
  }
}

/**
 * Look up the full account for a position's accountId.
 */
function getAccount(
  accountId: string | undefined,
  accountMap?: Map<string, Account>
): Account | undefined {
  if (!accountId || !accountMap) return undefined;
  return accountMap.get(accountId);
}

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
 * Dust threshold for filtering small positions
 */
export const DUST_THRESHOLD = 100; // $100

/**
 * Filter out dust positions (small values under threshold)
 * Professional investor POV: Hide noise but keep significant debt visible
 *
 * Rules:
 * - Hide positions where |value| < $100
 * - KEEP debt positions where value < -$100 (significant debt matters)
 * - Always show positions with 0 value (might need attention)
 */
export function filterDustPositions<T extends { value: number }>(
  positions: T[],
  hideDust: boolean,
  threshold: number = DUST_THRESHOLD
): T[] {
  if (!hideDust) return positions;

  return positions.filter((p) => {
    // Keep zero-valued positions visible (missing price / unresolved quote cases)
    if (p.value === 0) return true;
    const absValue = Math.abs(p.value);
    // Keep if above threshold
    if (absValue >= threshold) return true;
    // Keep significant debt (negative value below -threshold)
    if (p.value < -threshold) return true;
    // Hide dust
    return false;
  });
}

/**
 * Extract clean currency code from system-generated symbols
 * Handles patterns like "CASH_CHF_1769344861626" -> "CHF"
 */
export function extractCurrencyCode(symbol: string): string {
  const upper = symbol.toUpperCase();

  // Pattern: CASH_{CURRENCY}_{ID}
  const cashMatch = upper.match(/^CASH_([A-Z]{3})_/);
  if (cashMatch) {
    return cashMatch[1];
  }

  // Pattern: {CURRENCY}_{ID}
  const prefixMatch = upper.match(/^([A-Z]{3})_\d+/);
  if (prefixMatch) {
    return prefixMatch[1];
  }

  // Check if it's already a clean 3-5 letter code
  if (/^[A-Z]{3,5}$/i.test(symbol)) {
    return upper;
  }

  // Return original uppercase if no pattern matches
  return upper;
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
  // Pass effective type string to category service for backward compat
  const effectiveType = asset.type;
  const subCat = categoryService.getSubCategory(asset.symbol, effectiveType);

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
 *
 * Key distinction for net worth calculation:
 * - margin: Actual collateral deposited (counts towards net worth)
 * - longs/shorts: Notional exposure (does NOT count towards net worth)
 * - total: Only margin counts (what you actually own)
 */
export interface PerpsBreakdown {
  margin: number;          // Collateral deposited (counts towards net worth)
  longs: number;           // Long perp notional exposure
  shorts: number;          // Short perp notional exposure (as positive number)
  total: number;           // Net worth contribution (just margin)
}

/**
 * Per-exchange perp stats - single source of truth for perps page
 */
export interface PerpExchangeStats {
  exchange: string;
  margin: number;          // Stablecoin collateral
  spot: number;            // Non-stablecoin spot holdings on the exchange
  longs: number;           // Long perp notional
  shorts: number;          // Short perp notional
  accountValue: number;    // margin + spot (what counts towards net worth)
  netExposure: number;     // longs - shorts (directional exposure)
  positionCount: number;
}

/**
 * Complete perps page data - single source of truth
 */
export interface PerpPageData {
  // Positions categorized
  marginPositions: AssetWithPrice[];     // Stablecoin deposits
  tradingPositions: AssetWithPrice[];    // Actual perp trades (Long/Short)
  spotHoldings: AssetWithPrice[];        // Non-stablecoin spot on perp exchanges
  allPerpPositions: AssetWithPrice[];    // All positions on perp exchanges
  // Per-exchange breakdown
  exchangeStats: PerpExchangeStats[];
  // Has any perp activity
  hasPerps: boolean;
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
  const effectiveClass = position.assetClass ?? assetClassFromType(position.type);
  return effectiveClass === 'crypto'
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
 * Default FX rates (fallback when rates not provided)
 * Rates are: 1 unit of currency = X USD
 * Updated Jan 2025 - these are fetched live from API when possible
 */
const DEFAULT_FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.19,    // 1 EUR = 1.19 USD
  GBP: 1.37,    // 1 GBP = 1.37 USD
  CHF: 1.30,    // 1 CHF = 1.30 USD
  JPY: 0.0065,  // 1 JPY = 0.0065 USD
  CAD: 0.73,    // 1 CAD = 0.73 USD
  AUD: 0.69,    // 1 AUD = 0.69 USD
  PLN: 0.28,    // 1 PLN = 0.28 USD
  CZK: 0.049,   // 1 CZK = 0.049 USD
  SEK: 0.11,    // 1 SEK = 0.11 USD
  NOK: 0.10,    // 1 NOK = 0.10 USD
  DKK: 0.16,    // 1 DKK = 0.16 USD
  HUF: 0.0031,  // 1 HUF = 0.0031 USD
  CNY: 0.14,    // 1 CNY = 0.14 USD
  HKD: 0.13,    // 1 HKD = 0.13 USD
  SGD: 0.79,    // 1 SGD = 0.79 USD
  NZD: 0.60,    // 1 NZD = 0.60 USD
  INR: 0.011,   // 1 INR = 0.011 USD
  BRL: 0.19,    // 1 BRL = 0.19 USD
  MXN: 0.058,   // 1 MXN = 0.058 USD
  ZAR: 0.063,   // 1 ZAR = 0.063 USD
  KRW: 0.00069, // 1 KRW = 0.00069 USD
  THB: 0.032,   // 1 THB = 0.032 USD
  TRY: 0.023,   // 1 TRY = 0.023 USD
  ILS: 0.32,    // 1 ILS = 0.32 USD
  AED: 0.27,    // 1 AED = 0.27 USD
  RON: 0.23,    // 1 RON = 0.23 USD
  ISK: 0.0082,  // 1 ISK = 0.0082 USD
  IDR: 0.00006, // 1 IDR = 0.00006 USD
  MYR: 0.25,    // 1 MYR = 0.25 USD
  PHP: 0.017,   // 1 PHP = 0.017 USD
};

/**
 * Calculate value and enriched data for a single position
 * Debt positions have negative value (reduce net worth)
 * Custom prices take precedence over market prices
 * FX rates are used to convert fiat cash to USD
 */
export function calculatePositionValue(
  position: Position,
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>,
  fxRates?: Record<string, number>
): AssetWithPrice {
  // Cash positions - apply FX conversion to USD
  // Check BOTH explicit cash class/type AND positions that categoryService identifies as cash
  // (e.g., manual positions with fiat currency symbols like CHF, EUR, GBP)
  const effectiveClass = position.assetClass ?? assetClassFromType(position.type);
  const isCashByType = effectiveClass === 'cash';
  const isCashByCategory = getMainCategory(position.symbol, position.type) === 'cash';

  if (isCashByType || isCashByCategory) {
    const currency = extractCurrencyCode(position.symbol).toUpperCase();
    // Use fxRates only if it has entries, otherwise fall back to DEFAULT_FX_RATES
    // Empty object {} is truthy but useless, so check for keys
    const rates = (fxRates && Object.keys(fxRates).length > 0) ? fxRates : DEFAULT_FX_RATES;
    const fxRate = rates[currency] ?? DEFAULT_FX_RATES[currency] ?? 1.0;
    const valueInUsd = position.amount * fxRate;

    console.log(`[FX] ${position.symbol} -> ${currency}: ${position.amount} × ${fxRate} = $${valueInUsd.toFixed(2)} (using ${fxRates && Object.keys(fxRates).length > 0 ? 'live' : 'default'} rates)`);

    return {
      ...position,
      currentPrice: fxRate,
      value: valueInUsd,
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
  if ((!priceData || priceData.price === 0) && effectiveClass === 'crypto') {
    const priceProvider = getPriceProvider();
    const coinGeckoKey = priceProvider.getCoinId(position.symbol);
    const coinGeckoData = prices[coinGeckoKey];
    if (coinGeckoData && coinGeckoData.price > 0) {
      priceData = coinGeckoData;
    }
  }

  // Fallback for stablecoins - always use $1 if no price found
  // This ensures USDC, USDT, etc. always have correct pricing
  const categoryService = getCategoryService();
  const isStablecoin = categoryService.isStablecoin(position.symbol);
  let currentPrice = priceData?.price || 0;
  if (currentPrice === 0 && isStablecoin) {
    currentPrice = 1;
  }
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
 * FX rates are used for fiat cash conversion to USD
 */
export function calculateAllPositionsWithPrices(
  positions: Position[],
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>,
  fxRates?: Record<string, number>
): AssetWithPrice[] {
  // Calculate values for all positions
  const positionsWithPrices = positions.map((p) =>
    calculatePositionValue(p, prices, customPrices, fxRates)
  );

  // Mark perp notional positions (perp long/short trades on perp exchanges)
  // These represent leveraged exposure, not actual holdings
  positionsWithPrices.forEach((p) => {
    const { isPerpTrade } = detectPerpTrade(p.name);
    const isOnPerpExchange = p.protocol ? isPerpProtocol(p.protocol) : false;
    if (isPerpTrade && isOnPerpExchange) {
      p.isPerpNotional = true;
    }
    // Debug: Log perp exchange positions
    if (isOnPerpExchange) {
      console.log(`[Portfolio] Perp position: "${p.name}" | isPerpTrade=${isPerpTrade} | isPerpNotional=${p.isPerpNotional} | value=${p.value}`);
    }
  });

  // Calculate total gross assets (positive values only, for allocation %)
  // EXCLUDE perp notional from allocation base - they're leveraged exposure, not actual holdings
  const totalGrossAssets = positionsWithPrices
    .filter((p) => p.value > 0 && !p.isPerpNotional)
    .reduce((sum, p) => sum + p.value, 0);

  // Calculate allocations (based on gross assets, not net)
  // Debt positions get negative allocation % to show their relative impact
  // Perp notional positions are excluded from allocation calculation
  positionsWithPrices.forEach((p) => {
    if (p.isPerpNotional) {
      p.allocation = 0; // Perp notional doesn't count towards allocation
    } else if (totalGrossAssets > 0) {
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
 * Calculate Net Worth - excludes perp notional, includes only actual holdings
 * Net Worth = Spot holdings + Cash + Margin - Debts (excluding perp shorts)
 *
 * Perp positions are LEVERAGED - they represent exposure, not actual holdings.
 * Only the MARGIN deposited (stablecoins like USDC/USDT/USDe) counts towards net worth.
 */
export function calculateNetWorth(assetsWithPrice: AssetWithPrice[]): number {
  const included = assetsWithPrice.filter(a => !a.isPerpNotional);
  const excluded = assetsWithPrice.filter(a => a.isPerpNotional);
  const netWorth = included.reduce((sum, a) => sum + a.value, 0);

  console.log(`[NetWorth] Included: ${included.length} positions, total: $${netWorth.toFixed(2)}`);
  console.log(`[NetWorth] Excluded (isPerpNotional): ${excluded.length} positions`);
  excluded.forEach(p => console.log(`  - "${p.name}" value=${p.value}`));

  return netWorth;
}

/**
 * Calculate comprehensive portfolio summary
 * Custom prices take precedence over market prices when provided
 * FX rates are used for fiat cash conversion to USD
 */
export function calculatePortfolioSummary(
  positions: Position[],
  prices: Record<string, PriceData>,
  customPrices?: Record<string, CustomPrice>,
  fxRates?: Record<string, number>
): PortfolioSummary {
  const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);

  // Net Worth excludes perp notional (leveraged positions)
  // Only actual holdings (margin, spot, cash) minus real debts count
  const totalValue = calculateNetWorth(assetsWithPrice);

  // Calculate total 24h change - exclude perp notional (they don't affect net worth)
  // For debt positions, a.changePercent24h is already inverted (negative when price goes up)
  // So we can simply sum up change24h values which are already correctly signed
  const change24h = assetsWithPrice
    .filter(a => !a.isPerpNotional)
    .reduce((sum, a) => sum + a.change24h, 0);

  // Calculate previous total value properly handling debt
  // Exclude perp notional since they don't affect net worth
  const previousTotalValue = assetsWithPrice
    .filter(a => !a.isPerpNotional)
    .reduce((sum, a) => {
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

  // Group by assetClass - exclude perp notional from category values (they don't affect net worth)
  const getEffectiveClass = (a: AssetWithPrice): AssetClass => a.assetClass ?? assetClassFromType(a.type);
  const cryptoAssets = assetsWithPrice.filter((a) => getEffectiveClass(a) === 'crypto' && !a.isPerpNotional);
  const equityAssets = assetsWithPrice.filter((a) => getEffectiveClass(a) === 'equity');
  const cashAssets = assetsWithPrice.filter((a) => getEffectiveClass(a) === 'cash');
  const otherAssets = assetsWithPrice.filter((a) => getEffectiveClass(a) === 'other');

  const cryptoValue = cryptoAssets.reduce((sum, a) => sum + a.value, 0);
  const equityValue = equityAssets.reduce((sum, a) => sum + a.value, 0);
  const cashValue = cashAssets.reduce((sum, a) => sum + a.value, 0);
  const otherValue = otherAssets.reduce((sum, a) => sum + a.value, 0);

  // Backward compat aliases
  const stockValue = equityValue;
  const manualValue = otherValue;

  // Top assets by value (for charts) - exclude perp notional
  const topAssets = assetsWithPrice.filter(a => !a.isPerpNotional).slice(0, 10);

  // Calculate gross assets and total debts
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  // Perp shorts are NOT real debt - they're directional exposure
  const grossAssets = assetsWithPrice
    .filter((a) => a.value > 0 && !a.isPerpNotional)
    .reduce((sum, a) => sum + a.value, 0);

  const totalDebts = assetsWithPrice
    .filter((a) => a.value < 0 && !a.isPerpNotional)
    .reduce((sum, a) => sum + Math.abs(a.value), 0);

  // Aggregate unique assets for asset count
  const uniqueAssets = new Set(assetsWithPrice.map(a => a.symbol.toLowerCase()));

  // Build assetsByClass (new)
  const assetsByClass: { assetClass: AssetClass; value: number; percentage: number }[] = [
    {
      assetClass: 'crypto' as const,
      value: cryptoValue,
      percentage: grossAssets > 0 ? (Math.max(0, cryptoValue) / grossAssets) * 100 : 0,
    },
    {
      assetClass: 'equity' as const,
      value: equityValue,
      percentage: grossAssets > 0 ? (Math.max(0, equityValue) / grossAssets) * 100 : 0,
    },
    {
      assetClass: 'cash' as const,
      value: cashValue,
      percentage: grossAssets > 0 ? (Math.max(0, cashValue) / grossAssets) * 100 : 0,
    },
    {
      assetClass: 'other' as const,
      value: otherValue,
      percentage: grossAssets > 0 ? (Math.max(0, otherValue) / grossAssets) * 100 : 0,
    },
  ].filter((t) => t.value !== 0);

  // Build legacy assetsByType for backward compat
  const assetsByType: { type: AssetType; value: number; percentage: number }[] = [
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
  ].filter((t) => t.value !== 0);

  return {
    totalValue,
    grossAssets,
    totalDebts,
    change24h,
    changePercent24h,
    cryptoValue,
    equityValue,
    stockValue,
    cashValue,
    otherValue,
    manualValue,
    positionCount: assetsWithPrice.length,
    assetCount: uniqueAssets.size,
    topAssets,
    assetsByClass,
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
    const effectiveClass = position.assetClass ?? assetClassFromType(position.type);
    if (effectiveClass === 'cash') {
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
 * Debt positions are netted with non-debt positions of the same symbol
 * Perp notional positions (longs/shorts) are kept separate from spot holdings
 */
export function aggregatePositionsBySymbol(
  positions: AssetWithPrice[]
): AssetWithPrice[] {
  const assetMap = new Map<string, AssetWithPrice>();

  // Calculate total gross assets for allocation % (positive values only)
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  const totalGrossAssets = positions
    .filter((p) => p.value > 0 && !p.isPerpNotional)
    .reduce((sum, p) => sum + p.value, 0);

  positions.forEach((asset) => {
    // Keep perp notional positions separate (leveraged exposure, not spot holdings)
    // But net debt with non-debt positions of the same symbol
    const perpSuffix = asset.isPerpNotional ? '-perp' : '';
    const effectiveClass = asset.assetClass ?? assetClassFromType(asset.type);
    const key = `${asset.symbol.toLowerCase()}-${effectiveClass}${perpSuffix}`;
    const existing = assetMap.get(key);

    // For debt positions, amount should be subtracted to get net amount
    // Value is already negative for debt, so it naturally subtracts
    const amountContribution = asset.isDebt ? -asset.amount : asset.amount;

    if (existing) {
      const newAmount = (existing.isDebt ? -existing.amount : existing.amount) + amountContribution;
      const newValue = existing.value + asset.value;
      // Perp notional gets 0 allocation - it's not an actual holding
      const newAllocation = asset.isPerpNotional ? 0 :
        (totalGrossAssets > 0 ? (Math.max(0, newValue) / totalGrossAssets) * 100 : 0);
      // If result is net negative, mark as debt
      const isNetDebt = newValue < 0;
      assetMap.set(key, {
        ...existing,
        amount: Math.abs(newAmount),
        value: newValue,
        allocation: newAllocation,
        isPerpNotional: asset.isPerpNotional,
        isDebt: isNetDebt,
      });
    } else {
      // Perp notional gets 0 allocation - it's not an actual holding
      const allocation = asset.isPerpNotional ? 0 :
        (totalGrossAssets > 0 ? (Math.max(0, asset.value) / totalGrossAssets) * 100 : 0);
      assetMap.set(key, {
        ...asset,
        amount: Math.abs(amountContribution),
        allocation,
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
 * Asset summary data for detail view - single source of truth
 */
export interface AssetSummaryData {
  symbol: string;
  name: string;
  type: string;
  logo?: string;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  hasCustomPrice?: boolean;
  totalAmount: number;       // Net amount (debt subtracted)
  totalValue: number;        // Net value
  totalCostBasis: number | null;
  allocation: number;
  exposureCategory: string;
  exposureCategoryLabel: string;
  exposureCategoryColor: string;
  mainCategory: string;
  positionCount: number;
  walletCount: number;
}

/**
 * Calculate asset summary data - SINGLE SOURCE OF TRUTH
 * Provides aggregated data for a single asset across all positions
 */
export function calculateAssetSummary(
  assetPositions: AssetWithPrice[]
): AssetSummaryData | null {
  if (assetPositions.length === 0) return null;

  const categoryService = getCategoryService();
  const first = assetPositions[0];

  // Calculate net amount (subtract debt amounts)
  const totalAmount = assetPositions.reduce((sum, p) => {
    return sum + (p.isDebt ? -p.amount : p.amount);
  }, 0);

  // Value is already signed (negative for debt)
  const totalValue = assetPositions.reduce((sum, p) => sum + p.value, 0);

  const totalCostBasis = assetPositions.reduce(
    (sum, p) => sum + (p.costBasis || 0),
    0
  );
  const hasCostBasis = assetPositions.some((p) => p.costBasis);

  // Find the best position for price data (prefer one with valid price > 0)
  const positionWithPrice = assetPositions.find(p => p.currentPrice > 0) || first;

  // Get category info
  const exposureCat = categoryService.getExposureCategory(first.symbol, first.type);
  const exposureConfig = getExposureCategoryConfig(exposureCat);
  const mainCategory = categoryService.getMainCategory(first.symbol, first.type);

  // Count unique accounts (wallets, CEX, brokerage, etc.)
  const uniqueAccounts = new Set(
    assetPositions.filter(p => p.accountId).map(p => p.accountId)
  );

  // Calculate total allocation (sum of allocations, respecting sign)
  const totalAllocation = assetPositions.reduce((sum, p) => sum + p.allocation, 0);

  return {
    symbol: first.symbol,
    name: first.name,
    type: first.type,
    logo: first.logo,
    currentPrice: positionWithPrice.currentPrice,
    change24h: positionWithPrice.change24h,
    changePercent24h: positionWithPrice.changePercent24h,
    hasCustomPrice: positionWithPrice.hasCustomPrice,
    totalAmount,
    totalValue,
    totalCostBasis: hasCostBasis ? totalCostBasis : null,
    allocation: totalAllocation,
    exposureCategory: exposureCat,
    exposureCategoryLabel: exposureConfig.label,
    exposureCategoryColor: exposureConfig.color,
    mainCategory,
    positionCount: assetPositions.length,
    walletCount: uniqueAccounts.size,
  };
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
 * Calculate perps page data - SINGLE SOURCE OF TRUTH
 * Provides all data needed by the perps page:
 * - Categorized positions (margin, trading, spot)
 * - Per-exchange stats
 * - Metrics
 */
export function calculatePerpPageData(assets: AssetWithPrice[]): PerpPageData {
  const categoryService = getCategoryService();
  const perpPositions = filterPerpPositions(assets);

  // Categorize positions
  const marginPositions: AssetWithPrice[] = [];
  const tradingPositions: AssetWithPrice[] = [];
  const spotHoldings: AssetWithPrice[] = [];

  perpPositions.forEach((p) => {
    const subCat = categoryService.getSubCategory(p.symbol, p.type);
    const { isPerpTrade } = detectPerpTrade(p.name);

    if (subCat === 'stablecoins') {
      marginPositions.push(p);
    } else if (isPerpTrade) {
      tradingPositions.push(p);
    } else {
      spotHoldings.push(p);
    }
  });

  // Group by exchange and calculate stats
  const positionsByExchange: Record<string, AssetWithPrice[]> = {};
  perpPositions.forEach((p) => {
    const exchange = p.protocol || 'Unknown';
    if (!positionsByExchange[exchange]) {
      positionsByExchange[exchange] = [];
    }
    positionsByExchange[exchange].push(p);
  });

  const exchangeStats: PerpExchangeStats[] = Object.entries(positionsByExchange)
    .map(([exchange, positions]) => {
      let margin = 0;
      let longs = 0;
      let shorts = 0;
      let spot = 0;

      positions.forEach((p) => {
        const subCat = categoryService.getSubCategory(p.symbol, p.type);
        const { isPerpTrade } = detectPerpTrade(p.name);

        if (subCat === 'stablecoins' && !p.isDebt) {
          margin += p.value;
        } else if (subCat !== 'stablecoins' && isPerpTrade) {
          if (p.isDebt) {
            shorts += Math.abs(p.value);
          } else {
            longs += p.value;
          }
        } else if (subCat !== 'stablecoins' && !isPerpTrade) {
          spot += p.value;
        }
      });

      return {
        exchange,
        margin,
        spot,
        longs,
        shorts,
        accountValue: margin + spot,
        netExposure: longs - shorts,
        positionCount: positions.length,
      };
    })
    .sort((a, b) => b.accountValue - a.accountValue);

  // Determine if there's any perp activity
  const totalMargin = exchangeStats.reduce((sum, s) => sum + s.margin, 0);
  const hasPerps = totalMargin > 0 || perpPositions.length > 0;

  return {
    marginPositions,
    tradingPositions,
    spotHoldings,
    allPerpPositions: perpPositions,
    exchangeStats,
    hasPerps,
  };
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
  breakdown?: { label: string; value: number }[]; // Individual assets within this category
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
  'Perp DEX': '#00BCD4',
  'CEX': '#FF9800',
  'Banks & Brokers': '#2196F3',
  'Manual': '#607D8B',
};

/**
 * Calculate custody breakdown - SINGLE SOURCE OF TRUTH
 * Categories: Self-Custody, DeFi, Perp DEX, CEX, Banks & Brokers, Manual
 * Uses NET values - debt subtracts from the category where it was borrowed
 * EXCLUDES perp notional - only actual holdings (margin, spot) count
 */
export function calculateCustodyBreakdown(assets: AssetWithPrice[], accounts?: Account[]): CustodyBreakdownItem[] {
  const custodyMap: Record<string, { value: number; positions: Map<string, number> }> = {
    'Self-Custody': { value: 0, positions: new Map() },
    'DeFi': { value: 0, positions: new Map() },
    'Perp DEX': { value: 0, positions: new Map() },
    'CEX': { value: 0, positions: new Map() },
    'Banks & Brokers': { value: 0, positions: new Map() },
    'Manual': { value: 0, positions: new Map() },
  };

  const accountMap = buildAccountMap(accounts);

  // Process ALL assets including debt - use NET values
  // Debt subtracts from the category where it was borrowed
  // EXCLUDE perp notional - they're leveraged exposure, not custody
  assets.forEach((asset) => {
    // Skip perp notional - it's not actual custody, just exposure
    if (asset.isPerpNotional) return;

    const value = asset.value; // Can be negative for debt
    const symbolKey = asset.symbol.toUpperCase();
    const acctType = getAccountType(asset.accountId, accountMap);
    let category: string;

    if (acctType === 'cex') {
      category = 'CEX';
    } else if (isPerpProtocol(asset.protocol)) {
      // Perp DEXes (Hyperliquid, Vertex, Drift, etc.) are decentralized
      // Only margin (stablecoins) should show here, not notional
      category = 'Perp DEX';
    } else if (acctType === 'brokerage') {
      category = 'Banks & Brokers';
    } else if ((asset.assetClass ?? assetClassFromType(asset.type)) === 'equity' || (asset.assetClass ?? assetClassFromType(asset.type)) === 'cash') {
      category = 'Banks & Brokers';
    } else if (acctType === 'wallet') {
      if (asset.protocol) {
        category = 'DeFi';
      } else {
        category = 'Self-Custody';
      }
    } else {
      category = 'Manual';
    }

    custodyMap[category].value += value;
    // Only track positive positions in breakdown
    if (value > 0) {
      custodyMap[category].positions.set(
        symbolKey,
        (custodyMap[category].positions.get(symbolKey) || 0) + value
      );
    }
  });

  // Use NET total (sum of all values including negative)
  const total = Object.values(custodyMap).reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return Object.entries(custodyMap)
    .filter(([_, item]) => item.value > 0) // Only show categories with positive NET value
    .map(([label, item]) => ({
      label,
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: CUSTODY_COLORS[label] || '#6B7280',
      breakdown: Array.from(item.positions.entries())
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate chain breakdown
 * Uses NET values - debt subtracts from the chain where it was borrowed
 * EXCLUDES perp notional - only actual holdings count
 */
export function calculateChainBreakdown(assets: AssetWithPrice[], accounts?: Account[]): ChainBreakdownItem[] {
  const chainMap: Record<string, number> = {};
  const accountMap = buildAccountMap(accounts);

  // Process ALL assets including debt - use NET values
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  assets.forEach((asset) => {
    // Skip perp notional - it's not actual holding, just exposure
    if (asset.isPerpNotional) return;

    const value = asset.value; // Can be negative for debt
    let chain = 'Other';
    const acct = getAccount(asset.accountId, accountMap);

    const acctDs = acct?.connection.dataSource;
    const isCexAccount = acctDs === 'binance' || acctDs === 'coinbase' || acctDs === 'kraken' || acctDs === 'okx';
    if (isCexAccount) {
      // CEX positions - use exchange name (dataSource is the exchange name)
      chain = acctDs!.charAt(0).toUpperCase() + acctDs!.slice(1);
    } else if (asset.protocol && isPerpProtocol(asset.protocol)) {
      // Perp protocols
      chain = asset.protocol.charAt(0).toUpperCase() + asset.protocol.slice(1);
    } else if (asset.chain) {
      // On-chain positions
      chain = asset.chain.charAt(0).toUpperCase() + asset.chain.slice(1);
    }

    chainMap[chain] = (chainMap[chain] || 0) + value;
  });

  // Use NET total (only positive values contribute)
  const total = Object.values(chainMap).reduce((sum, v) => sum + Math.max(0, v), 0);

  return Object.entries(chainMap)
    .filter(([_, value]) => value > 0) // Only show chains with positive NET value
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
 * Uses NET values - debt subtracts from the relevant category
 * Perp trades are excluded from dominance calculations (they're leverage, not holdings)
 */
export function calculateCryptoMetrics(assets: AssetWithPrice[]): CryptoMetrics {
  const categoryService = getCategoryService();

  // Filter to crypto only
  const cryptoAssets = assets.filter((a) => {
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    return mainCat === 'crypto';
  });

  // Calculate NET totals per category (debt subtracts)
  let stablecoinValue = 0;
  let btcValue = 0;
  let ethValue = 0;
  let defiValue = 0;
  let totalNetValue = 0;

  cryptoAssets.forEach((asset) => {
    const value = asset.value; // Can be negative for debt
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    // Skip perp trades from dominance calculations - they're leveraged exposure, not holdings
    if (asset.protocol && isPerpProtocol(asset.protocol)) {
      const { isPerpTrade } = detectPerpTrade(asset.name);
      if (isPerpTrade) {
        // Don't count perp trades in asset dominance, but still add to total
        totalNetValue += value;
        return;
      }
    }

    // Add to category totals (including negative values for debt)
    if (subCat === 'stablecoins') {
      stablecoinValue += value;
    }
    if (subCat === 'btc') {
      btcValue += value;
    }
    if (subCat === 'eth') {
      ethValue += value;
    }
    // DeFi exposure: protocol is a DeFi protocol name (not a perp exchange)
    if (asset.protocol && !isPerpProtocol(asset.protocol)) {
      defiValue += value;
    }

    totalNetValue += value;
  });

  if (totalNetValue <= 0) {
    return { stablecoinRatio: 0, btcDominance: 0, ethDominance: 0, defiExposure: 0 };
  }

  return {
    stablecoinRatio: Math.max(0, (stablecoinValue / totalNetValue) * 100),
    btcDominance: Math.max(0, (btcValue / totalNetValue) * 100),
    ethDominance: Math.max(0, (ethValue / totalNetValue) * 100),
    defiExposure: Math.max(0, (defiValue / totalNetValue) * 100),
  };
}

/**
 * Calculate crypto allocation for horizontal bar display
 * Uses NET values - debt subtracts from the relevant category
 * EXCLUDES perp notional - only actual holdings count
 */
export function calculateCryptoAllocation(assets: AssetWithPrice[]): CryptoAllocationItem[] {
  const categoryService = getCategoryService();

  // Filter to crypto only (all values including debt)
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  const cryptoAssets = assets.filter((a) => {
    if (a.isPerpNotional) return false;
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    return mainCat === 'crypto';
  });

  const allocationMap: Record<string, { value: number; color: string }> = {};

  const categoryLabels: Record<string, string> = {
    btc: 'BTC',
    eth: 'ETH',
    sol: 'SOL',
    stablecoins: 'Stablecoins',
    tokens: 'Tokens',
    perps: 'Perps',
  };

  cryptoAssets.forEach((asset) => {
    const value = asset.value; // Can be negative for debt
    // Note: perp notional positions are already filtered out above
    // Margin and spot holdings on perp exchanges are categorized normally
    const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

    if (!allocationMap[subCat]) {
      allocationMap[subCat] = {
        value: 0,
        color: getCryptoSubCategoryColor(subCat),
      };
    }
    allocationMap[subCat].value += value;
  });

  // Use NET total (only positive category values)
  const totalValue = Object.values(allocationMap).reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return Object.entries(allocationMap)
    .filter(([_, item]) => item.value > 0) // Only show categories with positive NET value
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
 * Calculate exposure breakdown for donut chart (Stablecoins, ETH, DeFi, BTC, RWA, SOL, Privacy, AI, etc.)
 * Uses the centralized getExposureCategory() for granular token classification
 * Uses NET values - debt subtracts from the relevant category
 * Note: Perps are NOT a separate exposure category - perp positions are classified by their underlying asset
 * (e.g., BTC perp -> BTC exposure, ETH perp -> ETH exposure)
 * Includes breakdown of individual assets per category for tooltip display
 */
export function calculateExposureBreakdown(assets: AssetWithPrice[]): CryptoAllocationItem[] {
  const categoryService = getCategoryService();

  // Filter to crypto assets AND perp protocol positions (perps count towards underlying exposure)
  const cryptoAssets = assets.filter((a) => {
    const mainCat = categoryService.getMainCategory(a.symbol, a.type);
    if (mainCat === 'crypto') return true;
    // Include perp protocol positions - they represent underlying asset exposure
    if (a.protocol && isPerpProtocol(a.protocol)) return true;
    return false;
  });

  // Get all exposure category configs from the centralized service
  const allConfigs = categoryService.getAllExposureCategoryConfigs();

  // Track both total value and individual assets per category
  const exposureMap: Record<string, {
    value: number;
    color: string;
    label: string;
    assets: Map<string, number>; // symbol -> aggregated value
  }> = {};

  cryptoAssets.forEach((asset) => {
    const value = asset.value; // Can be negative for debt

    // For perp trades, extract the underlying asset from the name (e.g., "BTC Long (Hyperliquid)" -> btc)
    // For collateral on perp protocols, classify normally (e.g., USDC collateral -> stablecoins)
    // This gives true underlying exposure rather than treating perps as a separate category
    let exposureCat = categoryService.getExposureCategory(asset.symbol, asset.type);

    // For perp trades, try to extract underlying asset from name
    const { isPerpTrade } = detectPerpTrade(asset.name);
    if (isPerpTrade && asset.protocol && isPerpProtocol(asset.protocol)) {
      // Extract underlying asset from name like "BTC Long (Hyperliquid)" or "ETH Short"
      const underlyingMatch = asset.name.match(/^(\w+)\s+(long|short)/i);
      if (underlyingMatch) {
        const underlyingSymbol = underlyingMatch[1].toLowerCase();
        exposureCat = categoryService.getExposureCategory(underlyingSymbol, 'crypto');
      }
    }

    // Get config for this category
    const config = allConfigs[exposureCat as keyof typeof allConfigs] || allConfigs.tokens;

    if (!exposureMap[exposureCat]) {
      exposureMap[exposureCat] = {
        value: 0,
        color: config.color,
        label: config.label,
        assets: new Map(),
      };
    }
    exposureMap[exposureCat].value += value;

    // Track individual asset values (aggregate by symbol)
    // For perp trades, use the underlying symbol with a suffix to distinguish
    let symbolKey = asset.symbol.toUpperCase();
    if (isPerpTrade && asset.protocol && isPerpProtocol(asset.protocol)) {
      const underlyingMatch = asset.name.match(/^(\w+)\s+(long|short)/i);
      if (underlyingMatch) {
        const direction = underlyingMatch[2].toLowerCase();
        symbolKey = `${underlyingMatch[1].toUpperCase()} ${direction === 'long' ? 'Long' : 'Short'}`;
      }
    }
    const currentAssetValue = exposureMap[exposureCat].assets.get(symbolKey) || 0;
    exposureMap[exposureCat].assets.set(symbolKey, currentAssetValue + value);
  });

  // Use NET total (only positive category values)
  const totalValue = Object.values(exposureMap).reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return Object.entries(exposureMap)
    .filter(([_, item]) => item.value > 0) // Only show categories with positive NET value
    .map(([category, item]) => ({
      category,
      label: item.label,
      value: item.value,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
      color: item.color,
      // Convert assets map to sorted breakdown array (only positive values)
      breakdown: Array.from(item.assets.entries())
        .filter(([_, val]) => val > 0)
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .sort((a, b) => b.value - a.value),
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

    // Flag to track if this position should be added to category totals
    // Perp long/short are notional exposure, not actual holdings - they shouldn't
    // be counted in net worth or category totals
    let addToCategoryTotals = true;

    switch (classification) {
      case 'perp-long':
        perpsLongs += absValue;
        subCat = 'perps'; // Override for category breakdown
        addToCategoryTotals = false; // NOT a real asset - just notional exposure
        break;
      case 'perp-short':
        perpsShorts += absValue;
        subCat = 'perps'; // Override for category breakdown
        addToCategoryTotals = false; // NOT real debt - just notional exposure
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
        // Margin IS actual collateral - counts towards net worth
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

    // Only add to category totals if it's an actual holding (not perp notional)
    if (addToCategoryTotals) {
      if (isDebt) {
        categoryDebts[catKey] += absValue;
      } else {
        categoryAssets[catKey] += absValue;
      }
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
  // Total = ONLY margin (actual collateral deposited)
  // Perp longs/shorts are leveraged exposure, NOT actual holdings
  // From a net worth perspective, only the margin counts
  const perpsBreakdown: PerpsBreakdown = {
    margin: perpsMargin,
    longs: perpsLongs,         // Long notional (for exposure display)
    shorts: perpsShorts,       // Short notional (for exposure display)
    total: perpsMargin,        // Only margin counts towards net worth
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
  // EXCLUDE perp notional - concentration is based on net worth, not leveraged exposure
  const positiveAssets = assets.filter(a => a.value > 0 && !a.isPerpNotional);

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
 * EXCLUDES perp notional - only actual holdings count
 */
export function calculateAllocationBreakdown(assets: AssetWithPrice[]): AllocationBreakdownItem[] {
  const categoryService = getCategoryService();
  const allocationMap: Record<string, { value: number; color: string; positions: Map<string, number> }> = {
    'Cash & Equivalents': { value: 0, color: '#4CAF50', positions: new Map() },
    'Crypto': { value: 0, color: '#FF9800', positions: new Map() },
    'Equities': { value: 0, color: '#F44336', positions: new Map() },
    'Other': { value: 0, color: '#8B7355', positions: new Map() },
  };

  // Process ALL assets (including debt) - use NET values
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  assets.forEach((asset) => {
    // Skip perp notional - it's not actual holding, just exposure
    if (asset.isPerpNotional) return;

    const value = asset.value; // Can be negative for debt
    const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
    const symbolKey = asset.symbol.toUpperCase();

    if (mainCat === 'cash') {
      allocationMap['Cash & Equivalents'].value += value;
      if (value > 0) {
        allocationMap['Cash & Equivalents'].positions.set(
          symbolKey,
          (allocationMap['Cash & Equivalents'].positions.get(symbolKey) || 0) + value
        );
      }
    } else if (mainCat === 'crypto') {
      const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
      if (subCat === 'stablecoins') {
        allocationMap['Cash & Equivalents'].value += value;
        if (value > 0) {
          allocationMap['Cash & Equivalents'].positions.set(
            symbolKey,
            (allocationMap['Cash & Equivalents'].positions.get(symbolKey) || 0) + value
          );
        }
      } else {
        allocationMap['Crypto'].value += value;
        if (value > 0) {
          allocationMap['Crypto'].positions.set(
            symbolKey,
            (allocationMap['Crypto'].positions.get(symbolKey) || 0) + value
          );
        }
      }
    } else if (mainCat === 'equities') {
      allocationMap['Equities'].value += value;
      if (value > 0) {
        allocationMap['Equities'].positions.set(
          symbolKey,
          (allocationMap['Equities'].positions.get(symbolKey) || 0) + value
        );
      }
    } else {
      // 'other' or any unhandled category
      allocationMap['Other'].value += value;
      if (value > 0) {
        allocationMap['Other'].positions.set(
          symbolKey,
          (allocationMap['Other'].positions.get(symbolKey) || 0) + value
        );
      }
    }
  });

  // Use NET total (only positive category values)
  const total = Object.values(allocationMap).reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return Object.entries(allocationMap)
    .filter(([_, item]) => item.value > 0) // Only show categories with positive NET value
    .map(([label, item]) => ({
      label,
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: item.color,
      breakdown: Array.from(item.positions.entries())
        .filter(([_, val]) => val > 0) // Only show positive values in breakdown
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
 * Uses NET values - debt SUBTRACTS from the risk category it belongs to
 * EXCLUDES perp notional - only actual holdings count
 */
export function calculateRiskProfile(assets: AssetWithPrice[]): RiskProfileItem[] {
  const categoryService = getCategoryService();
  const riskMap: Record<string, { value: number; color: string; positions: Map<string, number> }> = {
    'Conservative': { value: 0, color: '#4CAF50', positions: new Map() },
    'Moderate': { value: 0, color: '#2196F3', positions: new Map() },
    'Aggressive': { value: 0, color: '#F44336', positions: new Map() },
  };

  // Process ALL assets including debt (negative values subtract from their category)
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  assets.forEach((asset) => {
    // Skip perp notional - it's not actual holding, just exposure
    if (asset.isPerpNotional) return;

    const value = asset.value; // Can be negative for debt
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

  const total = Object.values(riskMap).reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return Object.entries(riskMap)
    .filter(([_, item]) => item.value > 0) // Only show categories with positive NET value
    .map(([label, item]) => ({
      label: label as 'Conservative' | 'Moderate' | 'Aggressive',
      value: item.value,
      percentage: total > 0 ? (item.value / total) * 100 : 0,
      color: item.color,
      breakdown: Array.from(item.positions.entries())
        .filter(([_, val]) => val > 0) // Only show positive positions in breakdown
        .map(([symbol, val]) => ({ label: symbol, value: val }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Institution breakdown item for cash page
 */
export interface InstitutionBreakdownItem {
  name: string;
  currency: string;
  amount: number;
  value: number;
  isWallet: boolean;
  positions: AssetWithPrice[];
}

/**
 * Cash breakdown result type
 */
export interface CashBreakdownResult {
  fiat: { value: number; count: number };
  stablecoins: { value: number; count: number };
  total: number;
  fiatPositions: AssetWithPrice[];
  stablecoinPositions: AssetWithPrice[];
  chartData: { label: string; value: number; color: string; breakdown: { label: string; value: number }[] }[];
  institutionBreakdown: InstitutionBreakdownItem[];
}

/**
 * Extract account/institution name from position name
 * Handles patterns like "Millennium (PLN)" -> "Millennium"
 * Also handles account lookups, protocols, chains
 */
export function extractAccountName(position: AssetWithPrice, accountMap?: Map<string, Account>): string {
  // Check for account name pattern: "AccountName (Currency)"
  const match = position.name.match(/^(.+?)\s*\(/);
  if (match) {
    return match[1].trim();
  }

  // If it has a DeFi protocol, use the protocol name
  if (position.protocol) {
    return position.protocol.charAt(0).toUpperCase() + position.protocol.slice(1);
  }

  // Look up the linked account
  const acct = getAccount(position.accountId, accountMap);
  if (acct) {
    const ds = acct.connection.dataSource;
    const isCex = ds === 'binance' || ds === 'coinbase' || ds === 'kraken' || ds === 'okx';
    const isWallet = ds === 'debank' || ds === 'helius';
    if (isCex) {
      return ds.charAt(0).toUpperCase() + ds.slice(1);
    }
    if (isWallet && 'address' in acct.connection) {
      const addr = (acct.connection as WalletConnection).address;
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }
    // Manual account (brokerage or cash) - use the account name
    return acct.name;
  }

  // If it has a chain, use the chain name
  if (position.chain) {
    return position.chain.charAt(0).toUpperCase() + position.chain.slice(1);
  }

  // Default to the full name or "Manual"
  return position.name || 'Manual';
}

/**
 * Calculate cash breakdown - SINGLE SOURCE OF TRUTH
 * Separates fiat cash from crypto stablecoins with option to combine
 * Uses GROSS ASSETS only (positive values)
 */
export function calculateCashBreakdown(
  assets: AssetWithPrice[],
  includeStablecoins: boolean = true,
  accounts?: Account[]
): CashBreakdownResult {
  const categoryService = getCategoryService();

  // Filter to fiat positions (mainCat === 'cash')
  const fiatPositions = assets.filter((p) => {
    const mainCat = categoryService.getMainCategory(p.symbol, p.type);
    return mainCat === 'cash';
  });

  // Filter to stablecoin positions (crypto stablecoins)
  const stablecoinPositions = assets.filter((p) => {
    const mainCat = categoryService.getMainCategory(p.symbol, p.type);
    const subCat = categoryService.getSubCategory(p.symbol, p.type);
    return mainCat === 'crypto' && subCat === 'stablecoins';
  });

  // Calculate NET totals - debt subtracts from the category
  const fiat = { value: 0, count: 0 };
  const stablecoins = { value: 0, count: 0 };

  fiatPositions.forEach((p) => {
    fiat.value += p.value; // Can be negative for debt
    if (p.value > 0) fiat.count++;
  });

  stablecoinPositions.forEach((p) => {
    stablecoins.value += p.value; // Can be negative for debt
    if (p.value > 0) stablecoins.count++;
  });

  const total = includeStablecoins ? fiat.value + stablecoins.value : fiat.value;

  // Calculate by currency for pie chart - use NET values
  const currencyMap: Record<string, { value: number; count: number; positions: AssetWithPrice[] }> = {};
  const positionsToAnalyze = includeStablecoins
    ? [...fiatPositions, ...stablecoinPositions]
    : fiatPositions;

  // Process ALL positions (including debt) to get NET by currency
  // Use extractCurrencyCode to clean up system-generated symbols like "CASH_CHF_123456"
  positionsToAnalyze.forEach((p) => {
    const currency = extractCurrencyCode(p.symbol);
    if (!currencyMap[currency]) {
      currencyMap[currency] = { value: 0, count: 0, positions: [] };
    }
    currencyMap[currency].value += p.value; // Can be negative for debt
    if (p.value > 0) currencyMap[currency].count++;
    currencyMap[currency].positions.push(p);
  });

  // Define colors for common currencies
  const currencyColors: Record<string, string> = {
    'USD': '#4CAF50',
    'EUR': '#2196F3',
    'GBP': '#9C27B0',
    'CHF': '#F44336',
    'JPY': '#FF9800',
    'PLN': '#DC143C',
    'USDT': '#26A17B',
    'USDC': '#2775CA',
    'DAI': '#F5AC37',
    'BUSD': '#F0B90B',
    'FRAX': '#000000',
    'USDE': '#1E88E5',
    'SUSDE': '#1565C0',
  };

  const accountMap = buildAccountMap(accounts);

  // Helper to get location label for a position
  const getLocationLabel = (p: AssetWithPrice) => {
    const acct = getAccount(p.accountId, accountMap);
    if (acct) {
      const ds = acct.connection.dataSource;
      const isCex = ds === 'binance' || ds === 'coinbase' || ds === 'kraken' || ds === 'okx';
      if (isCex) return ds.toUpperCase();
      if (p.protocol) return p.protocol;
      const isWallet = ds === 'debank' || ds === 'helius';
      if (isWallet && 'address' in acct.connection) {
        const addr = (acct.connection as WalletConnection).address;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      }
    }
    if (p.protocol) return p.protocol;
    return 'Manual';
  };

  // Generate chartData sorted by value with breakdown - only show positive NET values
  const chartData = Object.entries(currencyMap)
    .filter(([_, data]) => data.value > 0) // Only currencies with positive NET value
    .map(([currency, data]) => ({
      label: currency,
      value: data.value,
      color: currencyColors[currency] || '#6B7280',
      breakdown: data.positions
        .filter(p => p.value > 0) // Only show positive positions in breakdown
        .map(p => ({ label: getLocationLabel(p), value: p.value }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.value - a.value);

  // Calculate institution breakdown
  const institutionMap: Record<string, InstitutionBreakdownItem> = {};

  positionsToAnalyze.forEach((p) => {
    if (p.value <= 0) return; // Only positive positions for institution breakdown

    const accountName = extractAccountName(p, accountMap);
    const currency = extractCurrencyCode(p.symbol);
    const acctType = getAccountType(p.accountId, accountMap);
    const isWallet = acctType === 'wallet';
    const key = `${accountName}_${currency}`;

    if (!institutionMap[key]) {
      institutionMap[key] = {
        name: accountName,
        currency,
        amount: 0,
        value: 0,
        isWallet,
        positions: [],
      };
    }

    institutionMap[key].amount += p.amount;
    institutionMap[key].value += p.value;
    institutionMap[key].positions.push(p);
  });

  const institutionBreakdown = Object.values(institutionMap)
    .sort((a, b) => b.value - a.value);

  return {
    fiat,
    stablecoins,
    total,
    fiatPositions,
    stablecoinPositions,
    chartData,
    institutionBreakdown,
  };
}

/**
 * Equities breakdown result type
 */
export interface EquitiesBreakdownResult {
  stocks: { value: number; count: number };
  etfs: { value: number; count: number };
  total: number;
  equityPositions: AssetWithPrice[];
  chartData: { label: string; value: number; color: string; breakdown: { label: string; value: number }[] }[];
}

/**
 * Calculate equities breakdown - SINGLE SOURCE OF TRUTH
 * Separates stocks from ETFs
 * Uses GROSS ASSETS only (positive values)
 */
export function calculateEquitiesBreakdown(assets: AssetWithPrice[]): EquitiesBreakdownResult {
  const categoryService = getCategoryService();

  // Filter to equities only
  const equityPositions = assets.filter((p) => {
    const mainCat = categoryService.getMainCategory(p.symbol, p.type);
    return mainCat === 'equities';
  });

  // Track NET values by type - debt subtracts from category
  let stocksValue = 0;
  let etfsValue = 0;
  let stocksCount = 0;
  let etfsCount = 0;
  const stockPositions: AssetWithPrice[] = [];
  const etfPositions: AssetWithPrice[] = [];

  equityPositions.forEach((p) => {
    const subCat = categoryService.getSubCategory(p.symbol, p.type);
    if (subCat === 'etfs') {
      etfsValue += p.value; // Can be negative for debt
      etfsCount++; // Count holdings, independent from current valuation
      if (p.value > 0) {
        etfPositions.push(p);
      }
    } else {
      stocksValue += p.value; // Can be negative for debt
      stocksCount++; // Count holdings, independent from current valuation
      if (p.value > 0) {
        stockPositions.push(p);
      }
    }
  });

  const total = stocksValue + etfsValue;

  // Helper to aggregate by symbol (only positive values for breakdown)
  const aggregateBySymbol = (positions: AssetWithPrice[]) => {
    const map = new Map<string, number>();
    positions.forEach(p => {
      const key = p.symbol.toUpperCase();
      map.set(key, (map.get(key) || 0) + p.value);
    });
    return Array.from(map.entries())
      .filter(([_, value]) => value > 0) // Only show positive NET values
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Build chart data - only show categories with positive NET value
  const chartData: { label: string; value: number; color: string; breakdown: { label: string; value: number }[] }[] = [];
  if (stocksValue > 0) {
    chartData.push({
      label: 'Stocks',
      value: stocksValue,
      color: SUBCATEGORY_COLORS.equities_stocks,
      breakdown: aggregateBySymbol(stockPositions),
    });
  }
  if (etfsValue > 0) {
    chartData.push({
      label: 'ETFs',
      value: etfsValue,
      color: SUBCATEGORY_COLORS.equities_etfs,
      breakdown: aggregateBySymbol(etfPositions),
    });
  }

  return {
    stocks: { value: Math.max(0, stocksValue), count: stocksCount },
    etfs: { value: Math.max(0, etfsValue), count: etfsCount },
    total: Math.max(0, total),
    equityPositions,
    chartData,
  };
}

/**
 * Crypto breakdown result type
 */
export interface CryptoBreakdownResult {
  total: number;
  cryptoPositions: AssetWithPrice[];
  chartData: { label: string; value: number; color: string; breakdown: { label: string; value: number }[] }[];
  byCategory: Record<string, { value: number; count: number }>;
}

/**
 * Calculate crypto breakdown by sub-category - SINGLE SOURCE OF TRUTH
 * Uses NET values - debt subtracts from the relevant category
 * EXCLUDES perp notional - only actual holdings count
 */
export function calculateCryptoBreakdown(assets: AssetWithPrice[]): CryptoBreakdownResult {
  const categoryService = getCategoryService();

  // Filter to crypto only
  // EXCLUDE perp notional - they're leveraged exposure, not actual holdings
  const cryptoPositions = assets.filter((p) => {
    if (p.isPerpNotional) return false;
    const mainCat = categoryService.getMainCategory(p.symbol, p.type);
    return mainCat === 'crypto';
  });

  const categoryLabels: Record<string, string> = {
    'btc': 'Bitcoin',
    'eth': 'Ethereum',
    'sol': 'Solana',
    'stablecoins': 'Stablecoins',
    'tokens': 'Tokens',
    'perps': 'Perps',
  };

  // Group by sub-category - use NET values (debt subtracts)
  const categoryMap: Record<string, { value: number; count: number; positions: AssetWithPrice[] }> = {};

  cryptoPositions.forEach((p) => {
    // Note: perp notional positions are already filtered out above
    // Margin and spot holdings on perp exchanges are categorized normally
    const subCat: string = categoryService.getSubCategory(p.symbol, p.type);

    if (!categoryMap[subCat]) {
      categoryMap[subCat] = { value: 0, count: 0, positions: [] };
    }
    categoryMap[subCat].value += p.value; // Can be negative for debt
    if (p.value > 0) {
      categoryMap[subCat].count++;
      categoryMap[subCat].positions.push(p);
    }
  });

  // NET total (only positive category values)
  const total = Object.values(categoryMap).reduce((sum, cat) => sum + Math.max(0, cat.value), 0);

  // Helper to aggregate by symbol (only positive values for breakdown)
  const aggregateBySymbol = (positions: AssetWithPrice[]) => {
    const map = new Map<string, number>();
    positions.forEach(p => {
      const key = p.symbol.toUpperCase();
      map.set(key, (map.get(key) || 0) + p.value);
    });
    return Array.from(map.entries())
      .filter(([_, value]) => value > 0) // Only show positive NET values
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Build chart data sorted by value - only show categories with positive NET value
  const chartData = Object.entries(categoryMap)
    .filter(([_, data]) => data.value > 0)
    .map(([category, data]) => ({
      label: categoryLabels[category] || category,
      value: data.value,
      color: getCryptoSubCategoryColor(category),
      breakdown: aggregateBySymbol(data.positions),
    }))
    .sort((a, b) => b.value - a.value);

  // Build byCategory summary - only positive values
  const byCategory: Record<string, { value: number; count: number }> = {};
  Object.entries(categoryMap).forEach(([cat, data]) => {
    if (data.value > 0) {
      byCategory[cat] = { value: data.value, count: data.count };
    }
  });

  return {
    total,
    cryptoPositions,
    chartData,
    byCategory,
  };
}
