'use client';

import { useState, useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary } from '@/services';
import Header from '@/components/Header';
import NetWorthChart from '@/components/charts/NetWorthChart';
import { useRefresh } from '@/components/PortfolioProvider';
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils';
import { subDays, subMonths, subYears, format, isAfter } from 'date-fns';

type TimePeriod = '1w' | '1mon' | '3mon' | '1year' | 'ytd' | 'all';
type ViewMode = 'value' | 'assets' | 'pnl';

export default function PerformancePage() {
  const [period, setPeriod] = useState<TimePeriod>('1mon');
  const [viewMode, setViewMode] = useState<ViewMode>('value');

  const { positions, prices, customPrices, snapshots } = usePortfolioStore();
  const { refresh } = useRefresh();

  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

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

  // Calculate performance metrics
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
    <div>
      <Header title="Performance" onSync={refresh} />

      {/* Time period selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 p-1 bg-[var(--background-secondary)] rounded-lg">
          {(['1w', '1mon', '3mon', '1year', 'ytd'] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-white text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {p === '1w' ? '1 w' : p === '1mon' ? '1 mon' : p === '3mon' ? '3 mon' : p === '1year' ? '1 year' : 'YTD'}
            </button>
          ))}
        </div>

        <div className="text-sm text-[var(--foreground-muted)]">
          {format(subMonths(new Date(), period === '1w' ? 0 : period === '1mon' ? 1 : period === '3mon' ? 3 : 12), 'MMM dd, yyyy')}
          {' → '}
          {format(new Date(), 'MMM dd, yyyy')}
        </div>
      </div>

      {/* Main performance card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold">{formatCurrency(summary.totalValue)}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={getChangeColor(performanceMetrics.changePercent)}>
                {formatPercent(performanceMetrics.changePercent)}
              </span>
              <span className="text-[var(--foreground-muted)] text-sm">
                during last {period === '1w' ? '7 days' : period === '1mon' ? '30 days' : period === '3mon' ? '90 days' : period === '1year' ? '1 year' : 'YTD'}
              </span>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)] rounded-lg">
            {(['value', 'assets', 'pnl'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--foreground-muted)]'
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

      {/* Asset performance tables */}
      <div className="grid grid-cols-2 gap-6">
        {/* Top Gainers */}
        <div className="card">
          <h3 className="font-semibold mb-4">Top Assets</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-2">Asset</th>
                <th className="table-header text-right pb-2">End value</th>
                <th className="table-header text-right pb-2">Price % change</th>
              </tr>
            </thead>
            <tbody>
              {summary.topAssets.slice(0, 8).map((asset) => (
                <tr key={asset.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-[10px] font-semibold">
                        {asset.symbol.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{asset.symbol.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right text-sm">{formatCurrency(asset.value)}</td>
                  <td className={`py-2 text-right text-sm ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Asset Prices */}
        <div className="card">
          <h3 className="font-semibold mb-4">Asset Prices</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-2">Asset</th>
                <th className="table-header text-right pb-2">Start price</th>
                <th className="table-header text-right pb-2">End price</th>
                <th className="table-header text-right pb-2">Price % change</th>
              </tr>
            </thead>
            <tbody>
              {summary.topAssets.slice(0, 8).map((asset) => {
                const startPrice = asset.currentPrice / (1 + asset.changePercent24h / 100);
                return (
                  <tr key={asset.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors">
                    <td className="py-2">
                      <span className="text-sm font-medium">{asset.symbol.toUpperCase()}</span>
                    </td>
                    <td className="py-2 text-right text-sm font-mono">
                      {formatCurrency(startPrice)}
                    </td>
                    <td className="py-2 text-right text-sm font-mono">
                      {formatCurrency(asset.currentPrice)}
                    </td>
                    <td className={`py-2 text-right text-sm ${getChangeColor(asset.changePercent24h)}`}>
                      {formatPercent(asset.changePercent24h)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gainers and Losers */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="card">
          <h3 className="font-semibold mb-4 text-[var(--positive)]">Gainers</h3>
          {gainers.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">No gainers today</p>
          ) : (
            <div className="space-y-2">
              {gainers.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium">{asset.symbol.toUpperCase()}</span>
                  <span className="text-sm text-[var(--positive)]">
                    {formatPercent(asset.changePercent24h)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4 text-[var(--negative)]">Losers</h3>
          {losers.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">No losers today</p>
          ) : (
            <div className="space-y-2">
              {losers.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium">{asset.symbol.toUpperCase()}</span>
                  <span className="text-sm text-[var(--negative)]">
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
