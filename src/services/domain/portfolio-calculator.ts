/**
 * Portfolio Calculator - Domain Service
 * Pure business logic for portfolio calculations
 */

import { Position, PriceData, AssetWithPrice, PortfolioSummary } from '@/types';
import { getPriceProvider } from '../providers';

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
 * Calculate value and enriched data for a single position
 * Debt positions have negative value (reduce net worth)
 */
export function calculatePositionValue(
  position: Position,
  prices: Record<string, PriceData>
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

  const priceKey = getPriceKey(position);
  const priceData = prices[priceKey];

  const currentPrice = priceData?.price || 0;
  // Debt positions have negative value (they reduce your net worth)
  const rawValue = position.amount * currentPrice;
  const value = position.isDebt ? -rawValue : rawValue;

  // For debt, 24h change is inverted (if asset price goes up, your debt value goes up = bad for you)
  const rawChange24h = (priceData?.change24h || 0) * position.amount;
  const change24h = position.isDebt ? -rawChange24h : rawChange24h;
  const changePercent24h = priceData?.changePercent24h || 0;

  // Debug logging for position calculations
  const debtLabel = position.isDebt ? ' [DEBT]' : '';
  console.log(`[CALC] ${position.symbol}${debtLabel}: amount=${position.amount}, priceKey=${priceKey}, price=${currentPrice}, value=${value.toFixed(2)}`);

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
 */
export function calculateAllPositionsWithPrices(
  positions: Position[],
  prices: Record<string, PriceData>
): AssetWithPrice[] {
  // Calculate values for all positions
  const positionsWithPrices = positions.map((p) =>
    calculatePositionValue(p, prices)
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
 */
export function calculatePortfolioSummary(
  positions: Position[],
  prices: Record<string, PriceData>
): PortfolioSummary {
  const assetsWithPrice = calculateAllPositionsWithPrices(positions, prices);
  const totalValue = assetsWithPrice.reduce((sum, a) => sum + a.value, 0);

  // Calculate total 24h change
  const previousTotalValue = assetsWithPrice.reduce((sum, a) => {
    if (a.changePercent24h === 0) return sum + a.value;
    const previousPrice = a.currentPrice / (1 + a.changePercent24h / 100);
    return sum + a.amount * previousPrice;
  }, 0);

  const change24h = totalValue - previousTotalValue;
  const changePercent24h =
    previousTotalValue > 0
      ? ((totalValue - previousTotalValue) / previousTotalValue) * 100
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

  const assetsByType = [
    {
      type: 'crypto' as const,
      value: cryptoValue,
      percentage: totalValue > 0 ? (cryptoValue / totalValue) * 100 : 0,
    },
    {
      type: 'stock' as const,
      value: stockValue,
      percentage: totalValue > 0 ? (stockValue / totalValue) * 100 : 0,
    },
    {
      type: 'cash' as const,
      value: cashValue,
      percentage: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
    },
    {
      type: 'manual' as const,
      value: manualValue,
      percentage: totalValue > 0 ? (manualValue / totalValue) * 100 : 0,
    },
  ].filter((t) => t.value > 0);

  return {
    totalValue,
    change24h,
    changePercent24h,
    cryptoValue,
    stockValue,
    cashValue,
    manualValue,
    topAssets,
    assetsByType,
  };
}

/**
 * Calculate total NAV from positions
 */
export function calculateTotalNAV(
  positions: Position[],
  prices: Record<string, PriceData>
): number {
  return positions.reduce((sum, position) => {
    const priceKey = getPriceKey(position);
    const price = prices[priceKey]?.price || 0;
    return sum + position.amount * price;
  }, 0);
}

/**
 * Group positions by symbol and aggregate
 */
export function aggregatePositionsBySymbol(
  positions: AssetWithPrice[]
): AssetWithPrice[] {
  const assetMap = new Map<string, AssetWithPrice>();
  const totalNAV = positions.reduce((sum, p) => sum + p.value, 0);

  positions.forEach((asset) => {
    const key = `${asset.symbol.toLowerCase()}-${asset.type}`;
    const existing = assetMap.get(key);

    if (existing) {
      const newAmount = existing.amount + asset.amount;
      const newValue = existing.value + asset.value;
      assetMap.set(key, {
        ...existing,
        amount: newAmount,
        value: newValue,
        allocation: totalNAV > 0 ? (newValue / totalNAV) * 100 : 0,
      });
    } else {
      assetMap.set(key, { ...asset });
    }
  });

  return Array.from(assetMap.values()).sort((a, b) => b.value - a.value);
}
