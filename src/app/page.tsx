'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, Info } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary, calculateAllPositionsWithPrices, calculateExposureData } from '@/services';
import NetWorthChart from '@/components/charts/NetWorthChart';
import ExposureChart from '@/components/charts/ExposureChart';
import Tooltip from '@/components/ui/Tooltip';
import Link from 'next/link';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
} from '@/lib/utils';

export default function OverviewPage() {
  const { positions, prices, customPrices, snapshots, hideBalances } = usePortfolioStore();

  // Calculate portfolio summary (including custom price overrides)
  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Calculate all positions for exposure chart
  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized exposure calculation
  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const { simpleBreakdown, exposureMetrics, perpsMetrics, concentrationMetrics, spotDerivatives } = exposureData;

  const hasData = positions.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
          <TrendingUp className="w-10 h-10 text-[var(--foreground-muted)]" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No positions yet</h2>
        <p className="text-[var(--foreground-muted)] text-center max-w-md">
          Add your first position to start tracking your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <div className="card-glow">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="stat-label mb-2">Net Worth</p>
            <h2 className="stat-value-lg">
              {hideBalances ? '••••••••' : formatCurrency(summary.totalValue)}
            </h2>
            <div className="flex items-center gap-3 mt-3">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                summary.changePercent24h >= 0 ? 'bg-[var(--positive-light)]' : 'bg-[var(--negative-light)]'
              }`}>
                {summary.changePercent24h >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-[var(--positive)]" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-[var(--negative)]" />
                )}
                <span className={getChangeColor(summary.changePercent24h) + ' font-semibold'}>
                  {formatPercent(summary.changePercent24h)}
                </span>
              </div>
              <span className="text-[var(--foreground-muted)] text-sm">
                {hideBalances ? '••••' : formatCurrency(Math.abs(summary.change24h))} today
              </span>
            </div>
          </div>

          {/* Mini chart */}
          <div className="w-full lg:w-[400px] h-[120px]">
            <NetWorthChart snapshots={snapshots} height={120} minimal />
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tooltip
          content={
            <div className="space-y-2 text-sm">
              <div className="font-medium border-b border-[var(--border)] pb-2">Exposure Breakdown</div>
              <div className="flex justify-between">
                <span className="text-[var(--positive)]">Long</span>
                <span>{formatCurrency(exposureMetrics.longExposure)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--negative)]">Short</span>
                <span>{formatCurrency(exposureMetrics.shortExposure)}</span>
              </div>
            </div>
          }
          position="bottom"
        >
          <div className="metric-card cursor-help">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="stat-label">Gross Exposure</p>
              <Info className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
            </div>
            <p className="stat-value">
              {hideBalances ? '••••' : formatCurrency(exposureMetrics.grossExposure)}
            </p>
          </div>
        </Tooltip>

        <Tooltip
          content={
            <div className="text-sm">
              <p className="mb-2">Gross Exposure / Net Worth</p>
              <p className="text-[var(--foreground-muted)]">
                {exposureMetrics.leverage <= 1 ? 'No leverage' :
                 exposureMetrics.leverage <= 1.5 ? 'Low leverage' :
                 exposureMetrics.leverage <= 2 ? 'Moderate leverage' : 'High leverage'}
              </p>
            </div>
          }
          position="bottom"
        >
          <div className="metric-card cursor-help">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="stat-label">Leverage</p>
              <Info className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
            </div>
            <p className={`stat-value ${
              exposureMetrics.leverage > 2 ? 'text-[var(--negative)]' :
              exposureMetrics.leverage > 1.5 ? 'text-[var(--warning)]' : ''
            }`}>
              {exposureMetrics.leverage.toFixed(2)}x
            </p>
          </div>
        </Tooltip>

        <div className="metric-card">
          <p className="stat-label mb-2">Cash & Stables</p>
          <p className="stat-value text-[var(--positive)]">
            {hideBalances ? '••••' : formatCurrency(exposureMetrics.cashPosition)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {exposureMetrics.cashPercentage.toFixed(1)}% of portfolio
          </p>
        </div>

        <div className="metric-card">
          <p className="stat-label mb-2">Concentration</p>
          <p className={`stat-value ${
            concentrationMetrics.top5Percentage > 80 ? 'text-[var(--negative)]' :
            concentrationMetrics.top5Percentage > 60 ? 'text-[var(--warning)]' : ''
          }`}>
            {concentrationMetrics.top5Percentage.toFixed(0)}%
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Top 5 positions
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Allocation Breakdown */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold">Allocation</h3>
            <Link href="/exposure" className="text-sm text-[var(--accent-primary)] flex items-center gap-1 hover:underline">
              Details <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-4">
            {simpleBreakdown.map((item) => (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[var(--foreground-muted)]">
                      {item.percentage.toFixed(1)}%
                    </span>
                    <span className="font-mono font-medium w-28 text-right">
                      {hideBalances ? '••••' : formatCurrency(item.value)}
                    </span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, item.percentage))}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exposure Chart */}
        <div className="card">
          <h3 className="font-semibold mb-4">Exposure</h3>
          <ExposureChart assets={allAssetsWithPrices} size={180} />
        </div>
      </div>

      {/* Spot vs Derivatives */}
      {(spotDerivatives.derivativesLong > 0 || spotDerivatives.derivativesShort > 0) && (
        <div className="card">
          <h3 className="font-semibold mb-6">Spot vs Derivatives</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-[var(--background-tertiary)] rounded-xl">
              <p className="stat-label mb-3">Spot Positions</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">Long</span>
                  <span className="text-[var(--positive)] font-mono">
                    {hideBalances ? '••••' : formatCurrency(spotDerivatives.spotLong)}
                  </span>
                </div>
                {spotDerivatives.spotShort > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Short</span>
                    <span className="text-[var(--negative)] font-mono">
                      -{hideBalances ? '••••' : formatCurrency(spotDerivatives.spotShort)}
                    </span>
                  </div>
                )}
                <div className="divider !my-2" />
                <div className="flex justify-between font-medium">
                  <span>Net</span>
                  <span className="font-mono">
                    {hideBalances ? '••••' : formatCurrency(spotDerivatives.spotNet)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-[var(--background-tertiary)] rounded-xl">
              <p className="stat-label mb-3">Derivatives</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">Long</span>
                  <span className="text-[var(--positive)] font-mono">
                    {hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesLong)}
                  </span>
                </div>
                {spotDerivatives.derivativesShort > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--foreground-muted)]">Short</span>
                    <span className="text-[var(--negative)] font-mono">
                      -{hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesShort)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--foreground-muted)]">Collateral</span>
                  <span className="font-mono">
                    {hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesCollateral)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Positions */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">Top Positions</h3>
          <Link href="/positions" className="text-sm text-[var(--accent-primary)] flex items-center gap-1 hover:underline">
            View All <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">Holdings</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">24h</th>
              </tr>
            </thead>
            <tbody>
              {summary.topAssets.slice(0, 8).map((asset) => (
                <tr
                  key={asset.id}
                  className="hover-row border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--background-tertiary)] flex items-center justify-center text-sm font-bold">
                        {asset.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{asset.symbol.toUpperCase()}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{asset.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-right font-mono text-sm">
                    {formatCurrency(asset.currentPrice)}
                  </td>
                  <td className="py-4 text-right font-mono text-sm text-[var(--foreground-muted)]">
                    {hideBalances ? '•••' : formatNumber(asset.amount)}
                  </td>
                  <td className="py-4 text-right font-mono font-medium">
                    {hideBalances ? '••••' : formatCurrency(asset.value)}
                  </td>
                  <td className={`py-4 text-right font-mono text-sm ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
