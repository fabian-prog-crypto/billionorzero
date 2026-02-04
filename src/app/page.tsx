'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculatePortfolioSummary,
  calculateAllPositionsWithPrices,
  calculateExposureData,
  calculateAllocationBreakdown,
  calculateCustodyBreakdown,
  calculateRiskProfile,
} from '@/services';
import NetWorthChart from '@/components/charts/NetWorthChart';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
import EmptyState from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatPercent,
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

  const { exposureMetrics, concentrationMetrics, grossAssets, totalDebts } = exposureData;

  // Use centralized service functions for chart data (SINGLE SOURCE OF TRUTH)
  const allocationChartData = useMemo((): DonutChartItem[] => {
    return calculateAllocationBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const custodyChartData = useMemo((): DonutChartItem[] => {
    return calculateCustodyBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const riskChartData = useMemo((): DonutChartItem[] => {
    return calculateRiskProfile(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Extract category totals for display (from centralized allocation data)
  const categoryTotals = useMemo(() => {
    const cashItem = allocationChartData.find(item => item.label === 'Cash & Equivalents');
    const cryptoItem = allocationChartData.find(item => item.label === 'Crypto');
    const equitiesItem = allocationChartData.find(item => item.label === 'Equities');

    return {
      cash: cashItem?.value || 0,
      crypto: cryptoItem?.value || 0,
      equities: equitiesItem?.value || 0,
    };
  }, [allocationChartData]);

  // Use centralized metrics (already calculated in exposureData)
  const debtRatio = exposureMetrics.debtRatio;
  const uniqueAssetCount = concentrationMetrics.assetCount;
  const hhiIndex = concentrationMetrics.herfindahlIndex;

  const hasData = positions.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<TrendingUp className="w-full h-full" />}
        title="No positions yet"
        description="Add your first position to start tracking your portfolio."
        size="lg"
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section: Net Worth + Chart */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">NET WORTH</p>
          <h2 className="text-3xl font-semibold mb-3">
            {hideBalances ? '••••••••' : formatCurrency(summary.totalValue)}
          </h2>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5  ${
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
              {hideBalances ? '••••' : formatCurrency(Math.abs(summary.change24h))} (24h)
            </span>
          </div>
        </div>

        {/* Mini chart */}
        <div className="w-full lg:w-[350px] h-[100px]">
          <NetWorthChart snapshots={snapshots} height={100} minimal />
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Category Totals - using centralized service data */}
      <div>
        <h3 className="font-medium mb-4">Asset Allocation</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">CASH & EQUIVALENTS</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(categoryTotals.cash)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {grossAssets > 0 ? ((categoryTotals.cash / grossAssets) * 100).toFixed(1) : 0}% of assets
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">CRYPTO</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(categoryTotals.crypto)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {grossAssets > 0 ? ((categoryTotals.crypto / grossAssets) * 100).toFixed(1) : 0}% of assets
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">EQUITIES</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(categoryTotals.equities)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {grossAssets > 0 ? ((categoryTotals.equities / grossAssets) * 100).toFixed(1) : 0}% of assets
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">GROSS ASSETS</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(grossAssets)}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              Total before debt
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2 flex items-center gap-1">
              TOTAL DEBT
              {totalDebts > 0 && <AlertTriangle className="w-3 h-3 text-[var(--warning)]" />}
            </p>
            <p className={`text-xl font-semibold ${totalDebts > 0 ? 'text-[var(--negative)]' : ''}`}>
              {hideBalances ? '••••' : `-${formatCurrency(totalDebts)}`}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              {grossAssets > 0 ? ((totalDebts / grossAssets) * 100).toFixed(1) : 0}% of assets
            </p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* 3 Donut Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Allocation Breakdown */}
        <DonutChart
          title="Allocation"
          data={allocationChartData}
          hideValues={hideBalances}
          maxItems={5}
        />

        {/* Custody Breakdown */}
        <DonutChart
          title="Custody"
          data={custodyChartData}
          hideValues={hideBalances}
          maxItems={5}
        />

        {/* Risk Profile */}
        <DonutChart
          title="Risk Profile"
          data={riskChartData}
          hideValues={hideBalances}
          maxItems={5}
        />
      </div>

      <hr className="border-[var(--border)]" />

      {/* Risk Metrics Section */}
      <div>
        <h3 className="font-medium mb-4">Risk Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">GROSS EXPOSURE</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(exposureMetrics.grossExposure)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">NET EXPOSURE</p>
            <p className="text-xl font-semibold">
              {hideBalances ? '••••' : formatCurrency(exposureMetrics.netExposure)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">LEVERAGE</p>
            <p className="text-xl font-semibold">
              {exposureMetrics.leverage.toFixed(2)}x
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2 flex items-center gap-1">
              DEBT RATIO
              {debtRatio > 20 && <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />}
            </p>
            <p className={`text-xl font-semibold ${debtRatio > 20 ? 'text-[var(--warning)]' : ''}`}>
              {debtRatio.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Concentration Risk Section */}
      <div>
        <h3 className="font-medium mb-4">Concentration Risk</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">TOP POSITION</p>
            <p className="text-xl font-semibold">
              {concentrationMetrics.top1Percentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">TOP 5</p>
            <p className="text-xl font-semibold">
              {concentrationMetrics.top5Percentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">HHI INDEX</p>
            <p className="text-xl font-semibold">
              {hhiIndex}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">ASSETS</p>
            <p className="text-xl font-semibold">
              {uniqueAssetCount}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              across {positions.length} positions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
