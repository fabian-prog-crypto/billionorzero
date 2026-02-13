'use client';

import { useState, useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary, calculatePerformanceMetrics, getSharpeInterpretation, getDrawdownInterpretation } from '@/services';
import NetWorthChart from '@/components/charts/NetWorthChart';
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils';
import { subDays, subMonths, subYears, format, isAfter } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, Target, AlertTriangle } from 'lucide-react';

type TimePeriod = '1w' | '1mon' | '3mon' | '1year' | 'ytd' | 'all';
type ViewMode = 'value' | 'assets' | 'pnl';

export default function PerformancePage() {
  const [period, setPeriod] = useState<TimePeriod>('1mon');
  const [viewMode, setViewMode] = useState<ViewMode>('value');

  const { positions, prices, customPrices, fxRates, snapshots, riskFreeRate, hideBalances } = usePortfolioStore();

  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  // Filter snapshots based on time period
  const filteredSnapshots = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '1w':
        startDate = subDays(now, 7);
        break;
      case '1mon':
        startDate = subMonths(now, 1);
        break;
      case '3mon':
        startDate = subMonths(now, 3);
        break;
      case '1year':
        startDate = subYears(now, 1);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
      default:
        return snapshots;
    }

    return snapshots.filter((s) => isAfter(new Date(s.date), startDate));
  }, [snapshots, period]);

  // Calculate basic performance metrics
  const performanceMetrics = useMemo(() => {
    if (filteredSnapshots.length < 2) {
      return {
        startValue: summary.totalValue,
        endValue: summary.totalValue,
        change: 0,
        changePercent: 0,
      };
    }

    const startValue = filteredSnapshots[0].totalValue;
    const endValue = filteredSnapshots[filteredSnapshots.length - 1].totalValue;
    const change = endValue - startValue;
    const changePercent = startValue > 0 ? (change / startValue) * 100 : 0;

    return { startValue, endValue, change, changePercent };
  }, [filteredSnapshots, summary.totalValue]);

  // Calculate professional metrics (CAGR, Sharpe, Drawdown)
  const professionalMetrics = useMemo(() => {
    return calculatePerformanceMetrics(filteredSnapshots, riskFreeRate);
  }, [filteredSnapshots, riskFreeRate]);

  const sharpeInterp = getSharpeInterpretation(professionalMetrics.sharpeRatio);
  const drawdownInterp = getDrawdownInterpretation(professionalMetrics.maxDrawdown);

  // Calculate per-asset performance
  const assetPerformance = useMemo(() => {
    return summary.topAssets.map((asset) => {
      const costBasis = asset.costBasis || asset.value;
      const pnl = asset.value - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

      return {
        ...asset,
        pnl,
        pnlPercent,
      };
    });
  }, [summary.topAssets]);

  const gainers = assetPerformance.filter((a) => a.changePercent24h > 0).sort((a, b) => b.changePercent24h - a.changePercent24h);
  const losers = assetPerformance.filter((a) => a.changePercent24h < 0).sort((a, b) => a.changePercent24h - b.changePercent24h);

  return (
    <div className="space-y-8">
      {/* Time period selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-[var(--background-secondary)] ">
          {(['1w', '1mon', '3mon', '1year', 'ytd'] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2  text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {p === '1w' ? '1 w' : p === '1mon' ? '1 mon' : p === '3mon' ? '3 mon' : p === '1year' ? '1 year' : 'YTD'}
            </button>
          ))}
        </div>

        <div className="text-[13px] text-[var(--foreground-muted)]">
          {format(subMonths(new Date(), period === '1w' ? 0 : period === '1mon' ? 1 : period === '3mon' ? 3 : 12), 'MMM dd, yyyy')}
          {' → '}
          {format(new Date(), 'MMM dd, yyyy')}
        </div>
      </div>

      {/* Main performance section */}
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">PORTFOLIO VALUE</p>
            <h2 className="text-2xl font-semibold">{hideBalances ? '••••••••' : formatCurrency(summary.totalValue)}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={getChangeColor(performanceMetrics.changePercent)}>
                {formatPercent(performanceMetrics.changePercent)}
              </span>
              <span className="text-[var(--foreground-muted)] text-[13px]">
                during last {period === '1w' ? '7 days' : period === '1mon' ? '30 days' : period === '3mon' ? '90 days' : period === '1year' ? '1 year' : 'YTD'}
              </span>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)] ">
            {(['value', 'assets', 'pnl'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5  text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {mode === 'value' ? 'Value' : mode === 'assets' ? 'Assets' : 'PnL'}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="chart-container">
          <NetWorthChart snapshots={filteredSnapshots} height={300} />
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Professional Metrics Grid */}
      {professionalMetrics.dataPoints >= 2 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* CAGR */}
            <div className="relative group">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">CAGR</span>
                {professionalMetrics.dataQuality.cagrWarning && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                )}
              </div>
              <div className={`text-xl font-semibold ${getChangeColor(professionalMetrics.cagr)}`}>
                {professionalMetrics.cagr >= 0 ? '+' : ''}{professionalMetrics.cagr.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-1">
                Annualized from {professionalMetrics.periodDays} days
              </div>
              {professionalMetrics.dataQuality.cagrWarning && (
                <div className="tooltip whitespace-normal max-w-[200px]">
                  {professionalMetrics.dataQuality.cagrWarning}
                </div>
              )}
            </div>

            {/* Sharpe Ratio */}
            <div className="relative group">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">SHARPE RATIO</span>
                {professionalMetrics.dataQuality.sharpeWarning && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                )}
              </div>
              <div className="text-xl font-semibold" style={{ color: sharpeInterp.color }}>
                {professionalMetrics.sharpeRatio.toFixed(2)}
              </div>
              <div className="text-xs mt-1" style={{ color: sharpeInterp.color }}>
                {sharpeInterp.label}
              </div>
              <div className="tooltip whitespace-normal max-w-[200px]">
                <div>Risk-free rate: {(professionalMetrics.riskFreeRateUsed * 100).toFixed(1)}%</div>
                {professionalMetrics.dataQuality.sharpeWarning && (
                  <div className="mt-1 text-[var(--warning)]">{professionalMetrics.dataQuality.sharpeWarning}</div>
                )}
              </div>
            </div>

            {/* Max Drawdown */}
            <div className="relative group">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">MAX DRAWDOWN</span>
              </div>
              <div className="text-xl font-semibold text-[var(--negative)]">
                -{professionalMetrics.maxDrawdown.toFixed(1)}%
              </div>
              <div className="text-xs mt-1" style={{ color: drawdownInterp.color }}>
                {drawdownInterp.label}
                {professionalMetrics.maxDrawdownDate && (
                  <span className="text-[var(--foreground-muted)]"> ({format(new Date(professionalMetrics.maxDrawdownDate), 'MMM dd')})</span>
                )}
              </div>
            </div>

            {/* Volatility */}
            <div className="relative group">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">VOLATILITY</span>
                {professionalMetrics.dataQuality.volatilityWarning && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                )}
              </div>
              <div className="text-xl font-semibold">
                {professionalMetrics.volatility.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-1">
                Based on {professionalMetrics.dataPoints} days
              </div>
              {professionalMetrics.dataQuality.volatilityWarning && (
                <div className="tooltip whitespace-normal max-w-[200px]">
                  {professionalMetrics.dataQuality.volatilityWarning}
                </div>
              )}
            </div>
          </div>

          <hr className="border-[var(--border)]" />
        </>
      )}

      {/* No data message */}
      {professionalMetrics.dataPoints < 2 && (
        <>
          <div className="text-center py-8">
            <Activity className="w-8 h-8 mx-auto mb-2 text-[var(--foreground-muted)]" />
            <p className="text-[var(--foreground-muted)]">
              Not enough data for advanced metrics. Keep tracking to see CAGR, Sharpe ratio, and max drawdown.
            </p>
            <p className="text-xs text-[var(--foreground-subtle)] mt-1">
              {professionalMetrics.dataPoints} snapshot(s) available, need at least 2
            </p>
          </div>

          <hr className="border-[var(--border)]" />
        </>
      )}

      {/* Asset performance tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Assets */}
        <div>
          <h3 className="text-[15px] font-medium mb-4">Top Assets</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">24h</th>
              </tr>
            </thead>
            <tbody>
              {summary.topAssets.slice(0, 8).map((asset) => (
                <tr key={asset.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[var(--tag-bg)]  flex items-center justify-center text-[10px] font-semibold">
                        {asset.symbol.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right text-[13px]">
                    {hideBalances ? '••••' : formatCurrency(asset.value)}
                  </td>
                  <td className={`py-2 text-right text-[13px] ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Asset Prices */}
        <div>
          <h3 className="text-[15px] font-medium mb-4">Asset Prices</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">24h</th>
              </tr>
            </thead>
            <tbody>
              {summary.topAssets.slice(0, 8).map((asset) => (
                <tr key={asset.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors">
                  <td className="py-2">
                    <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                  </td>
                  <td className="py-2 text-right text-[13px] font-mono">
                    {formatCurrency(asset.currentPrice)}
                  </td>
                  <td className={`py-2 text-right text-[13px] ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Gainers and Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-[15px] font-medium mb-4 text-[var(--positive)]">Gainers</h3>
          {gainers.length === 0 ? (
            <p className="text-[13px] text-[var(--foreground-muted)]">No gainers today</p>
          ) : (
            <div className="space-y-2">
              {gainers.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-1">
                  <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                  <span className="text-[13px] text-[var(--positive)]">
                    {formatPercent(asset.changePercent24h)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-[15px] font-medium mb-4 text-[var(--negative)]">Losers</h3>
          {losers.length === 0 ? (
            <p className="text-[13px] text-[var(--foreground-muted)]">No losers today</p>
          ) : (
            <div className="space-y-2">
              {losers.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-1">
                  <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                  <span className="text-[13px] text-[var(--negative)]">
                    {formatPercent(asset.changePercent24h)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
