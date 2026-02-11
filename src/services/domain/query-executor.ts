/**
 * Query Executor
 *
 * Executes query tools by reading from the store and domain functions,
 * returning formatted QueryResult objects.
 */

import { QueryResult, QueryRow } from './command-types';
import { usePortfolioStore } from '@/store/portfolioStore';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils';
import {
  calculateAllPositionsWithPrices,
  calculatePortfolioSummary,
  calculateExposureData,
  calculateRiskProfile,
  calculatePerpPageData,
} from '@/services/domain/portfolio-calculator';
import { calculatePerformanceMetrics } from '@/services/domain/performance-metrics';
import { AssetWithPrice } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAssetsWithPrices(): AssetWithPrice[] {
  const store = usePortfolioStore.getState();
  return calculateAllPositionsWithPrices(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );
}

function errorResult(title: string, message: string): QueryResult {
  return {
    format: 'metric',
    title,
    value: 'Error',
    subtitle: message,
  };
}

function getAssetTypeLabel(type: string): string {
  switch (type) {
    case 'crypto': return 'Crypto';
    case 'stock': return 'Stocks';
    case 'etf': return 'ETFs';
    case 'cash': return 'Cash';
    case 'manual': return 'Manual';
    default: return type;
  }
}

// ─── Query Handlers ─────────────────────────────────────────────────────────

function queryNetWorth(): QueryResult {
  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  return {
    format: 'metric',
    title: 'Net Worth',
    value: formatCurrency(summary.totalValue),
    subtitle: `${summary.positionCount} positions across ${summary.assetCount} assets`,
  };
}

function queryPortfolioSummary(): QueryResult {
  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  const rows: QueryRow[] = summary.assetsByType.map((entry) => ({
    label: getAssetTypeLabel(entry.type),
    values: [
      formatCurrency(entry.value),
      formatPercent(entry.percentage) + ' of portfolio',
    ],
  }));

  return {
    format: 'table',
    title: 'Portfolio Summary',
    columns: ['Category', 'Value', '% of Portfolio'],
    rows,
  };
}

function queryTopPositions(args: Record<string, unknown>): QueryResult {
  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  const count = typeof args.count === 'number' ? args.count : 5;
  const topAssets = summary.topAssets.slice(0, count);

  const rows: QueryRow[] = topAssets.map((asset) => ({
    label: asset.symbol,
    values: [
      formatCurrency(asset.value),
      formatPercent(asset.allocation) + ' of assets',
      formatPercent(asset.changePercent24h),
    ],
    color: asset.changePercent24h >= 0 ? 'positive' as const : 'negative' as const,
  }));

  return {
    format: 'table',
    title: `Top ${count} Positions`,
    columns: ['Asset', 'Value', 'Allocation', '24h'],
    rows,
  };
}

function queryPositionDetails(args: Record<string, unknown>): QueryResult {
  const symbol = (args.symbol as string || '').toLowerCase();
  if (!symbol) {
    return errorResult('Position Details', 'No symbol provided');
  }

  const assets = getAssetsWithPrices();
  const matched = assets.filter(
    (a) => a.symbol.toLowerCase() === symbol
  );

  if (matched.length === 0) {
    return errorResult('Position Details', `No position found for "${symbol.toUpperCase()}"`);
  }

  // Aggregate if multiple positions with same symbol
  const totalValue = matched.reduce((sum, a) => sum + a.value, 0);
  const totalAmount = matched.reduce((sum, a) => sum + a.amount, 0);
  const price = matched[0].currentPrice;

  return {
    format: 'metric',
    title: `${symbol.toUpperCase()} Position`,
    value: formatCurrency(totalValue),
    subtitle: `${formatNumber(totalAmount)} @ ${formatCurrency(price)}`,
  };
}

function queryPositionsByType(args: Record<string, unknown>): QueryResult {
  const assetType = (args.assetType as string || '').toLowerCase();
  if (!assetType) {
    return errorResult('Positions by Type', 'No asset type provided');
  }

  const assets = getAssetsWithPrices();
  const filtered = assets.filter(
    (a) => a.type.toLowerCase() === assetType
  );

  if (filtered.length === 0) {
    return {
      format: 'table',
      title: `${getAssetTypeLabel(assetType)} Positions`,
      columns: ['Symbol', 'Amount', 'Value'],
      rows: [],
      subtitle: `No ${assetType} positions found`,
    };
  }

  const rows: QueryRow[] = filtered.map((a) => ({
    label: a.symbol,
    values: [
      formatNumber(a.amount),
      formatCurrency(a.value),
    ],
  }));

  return {
    format: 'table',
    title: `${getAssetTypeLabel(assetType)} Positions`,
    columns: ['Symbol', 'Amount', 'Value'],
    rows,
  };
}

function queryExposure(): QueryResult {
  const assets = getAssetsWithPrices();
  const exposureData = calculateExposureData(assets);
  const metrics = exposureData.exposureMetrics;

  const rows: QueryRow[] = [
    {
      label: 'Long Exposure',
      values: [formatCurrency(metrics.longExposure)],
      color: 'positive',
    },
    {
      label: 'Short Exposure',
      values: [formatCurrency(metrics.shortExposure)],
      color: 'negative',
    },
    {
      label: 'Gross Exposure',
      values: [formatCurrency(metrics.grossExposure)],
    },
    {
      label: 'Net Exposure',
      values: [formatCurrency(metrics.netExposure)],
      color: metrics.netExposure >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Leverage',
      values: [formatNumber(metrics.leverage, 2) + 'x'],
    },
  ];

  return {
    format: 'table',
    title: 'Portfolio Exposure',
    columns: ['Metric', 'Value'],
    rows,
  };
}

function queryCryptoExposure(): QueryResult {
  const assets = getAssetsWithPrices();
  const cryptoAssets = assets.filter((a) => a.type === 'crypto');

  if (cryptoAssets.length === 0) {
    return {
      format: 'table',
      title: 'Crypto Exposure',
      columns: ['Metric', 'Value'],
      rows: [],
      subtitle: 'No crypto positions found',
    };
  }

  const exposureData = calculateExposureData(cryptoAssets);
  const metrics = exposureData.exposureMetrics;

  const rows: QueryRow[] = [
    {
      label: 'Long Exposure',
      values: [formatCurrency(metrics.longExposure)],
      color: 'positive',
    },
    {
      label: 'Short Exposure',
      values: [formatCurrency(metrics.shortExposure)],
      color: 'negative',
    },
    {
      label: 'Gross Exposure',
      values: [formatCurrency(metrics.grossExposure)],
    },
    {
      label: 'Net Exposure',
      values: [formatCurrency(metrics.netExposure)],
      color: metrics.netExposure >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Leverage',
      values: [formatNumber(metrics.leverage, 2) + 'x'],
    },
  ];

  return {
    format: 'table',
    title: 'Crypto Exposure',
    columns: ['Metric', 'Value'],
    rows,
  };
}

function queryPerformance(): QueryResult {
  const store = usePortfolioStore.getState();
  const snapshots = store.snapshots;

  if (snapshots.length < 2) {
    return errorResult('Performance', 'Insufficient snapshot data. Need at least 2 daily snapshots.');
  }

  const metrics = calculatePerformanceMetrics(snapshots, store.riskFreeRate);

  const rows: QueryRow[] = [
    {
      label: 'Total Return',
      values: [formatPercent(metrics.totalReturn) + ` (${formatCurrency(metrics.totalReturnAbsolute)})`],
      color: metrics.totalReturn >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'CAGR',
      values: [formatPercent(metrics.cagr)],
      color: metrics.cagr >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Sharpe Ratio',
      values: [formatNumber(metrics.sharpeRatio, 2)],
    },
    {
      label: 'Max Drawdown',
      values: [formatPercent(-metrics.maxDrawdown) + ` (${formatCurrency(metrics.maxDrawdownAbsolute)})`],
      color: 'negative',
    },
    {
      label: 'Volatility',
      values: [formatPercent(metrics.volatility)],
    },
    {
      label: 'Period',
      values: [`${metrics.periodDays} days (${metrics.dataPoints} snapshots)`],
      color: 'muted',
    },
  ];

  return {
    format: 'table',
    title: 'Performance Metrics',
    columns: ['Metric', 'Value'],
    rows,
  };
}

function query24hChange(): QueryResult {
  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  return {
    format: 'metric',
    title: '24h Change',
    value: formatCurrency(summary.change24h),
    subtitle: formatPercent(summary.changePercent24h),
  };
}

function queryCategoryValue(args: Record<string, unknown>): QueryResult {
  const category = (args.category as string || '').toLowerCase();
  if (!category) {
    return errorResult('Category Value', 'No category provided');
  }

  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  const match = summary.assetsByType.find(
    (entry) => entry.type.toLowerCase() === category
  );

  if (!match) {
    return errorResult('Category Value', `No data for category "${category}"`);
  }

  return {
    format: 'metric',
    title: `${getAssetTypeLabel(match.type)} Value`,
    value: formatCurrency(match.value),
    subtitle: formatPercent(match.percentage) + ' of portfolio',
  };
}

function queryPositionCount(): QueryResult {
  const store = usePortfolioStore.getState();
  const summary = calculatePortfolioSummary(
    store.positions,
    store.prices,
    store.customPrices,
    store.fxRates
  );

  return {
    format: 'metric',
    title: 'Position Count',
    value: String(summary.positionCount),
    subtitle: `${summary.assetCount} unique assets`,
  };
}

function queryDebtSummary(): QueryResult {
  const assets = getAssetsWithPrices();
  const debtPositions = assets.filter(
    (a) => a.isDebt === true || a.value < 0
  );

  if (debtPositions.length === 0) {
    return {
      format: 'metric',
      title: 'Debt Summary',
      value: '$0',
      subtitle: 'No debt positions',
    };
  }

  const totalDebt = debtPositions.reduce(
    (sum, a) => sum + Math.abs(a.value),
    0
  );

  const rows: QueryRow[] = debtPositions.map((a) => ({
    label: a.symbol,
    values: [
      formatCurrency(Math.abs(a.value)),
      a.protocol || 'N/A',
    ],
    color: 'negative' as const,
  }));

  return {
    format: 'table',
    title: `Debt Summary (${formatCurrency(totalDebt)} total)`,
    columns: ['Asset', 'Amount Owed', 'Protocol'],
    rows,
  };
}

function queryLeverage(): QueryResult {
  const assets = getAssetsWithPrices();
  const exposureData = calculateExposureData(assets);
  const leverage = exposureData.exposureMetrics.leverage;

  return {
    format: 'metric',
    title: 'Portfolio Leverage',
    value: formatNumber(leverage, 2) + 'x',
    subtitle: `Gross exposure / Net worth`,
  };
}

function queryPerpsSummary(): QueryResult {
  const assets = getAssetsWithPrices();
  const perpData = calculatePerpPageData(assets);

  if (!perpData.hasPerps) {
    return {
      format: 'metric',
      title: 'Perps Summary',
      value: 'No perps',
      subtitle: 'No perpetual futures positions found',
    };
  }

  const rows: QueryRow[] = perpData.exchangeStats.map((stat) => ({
    label: stat.exchange,
    values: [
      formatCurrency(stat.margin) + ' margin',
      formatCurrency(stat.longs) + ' long',
      formatCurrency(stat.shorts) + ' short',
      formatCurrency(stat.netExposure) + ' net',
    ],
  }));

  return {
    format: 'table',
    title: 'Perps Summary',
    columns: ['Exchange', 'Margin', 'Longs', 'Shorts', 'Net Exposure'],
    rows,
  };
}

function queryRiskProfile(): QueryResult {
  const assets = getAssetsWithPrices();
  const riskProfile = calculateRiskProfile(assets);

  if (riskProfile.length === 0) {
    return {
      format: 'metric',
      title: 'Risk Profile',
      value: 'N/A',
      subtitle: 'No positions to analyze',
    };
  }

  const rows: QueryRow[] = riskProfile.map((item) => ({
    label: item.label,
    values: [
      formatCurrency(item.value),
      formatPercent(item.percentage) + ' of portfolio',
    ],
    color: item.label === 'Conservative'
      ? 'positive' as const
      : item.label === 'Aggressive'
        ? 'negative' as const
        : 'muted' as const,
  }));

  return {
    format: 'table',
    title: 'Risk Profile',
    columns: ['Category', 'Value', 'Allocation'],
    rows,
  };
}

// ─── Main Executor ──────────────────────────────────────────────────────────

export function executeQuery(tool: string, args: Record<string, unknown>): QueryResult {
  try {
    switch (tool) {
      case 'query_net_worth':
        return queryNetWorth();
      case 'query_portfolio_summary':
        return queryPortfolioSummary();
      case 'query_top_positions':
        return queryTopPositions(args);
      case 'query_position_details':
        return queryPositionDetails(args);
      case 'query_positions_by_type':
        return queryPositionsByType(args);
      case 'query_exposure':
        return queryExposure();
      case 'query_crypto_exposure':
        return queryCryptoExposure();
      case 'query_performance':
        return queryPerformance();
      case 'query_24h_change':
        return query24hChange();
      case 'query_category_value':
        return queryCategoryValue(args);
      case 'query_position_count':
        return queryPositionCount();
      case 'query_debt_summary':
        return queryDebtSummary();
      case 'query_leverage':
        return queryLeverage();
      case 'query_perps_summary':
        return queryPerpsSummary();
      case 'query_risk_profile':
        return queryRiskProfile();
      default:
        return errorResult('Unknown Query', `No handler for query tool "${tool}"`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResult('Query Failed', message);
  }
}
