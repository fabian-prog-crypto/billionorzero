'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculatePortfolioSummary,
  calculateAllPositionsWithPrices,
  calculateExposureData,
  calculateCustodyBreakdown,
  calculateAllocationBreakdown,
  calculateRiskProfile,
} from '@/services';
import NetWorthChart from '@/components/charts/NetWorthChart';
import DonutChart from '@/components/charts/DonutChart';
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

  const { exposureMetrics, concentrationMetrics } = exposureData;

  // Use centralized custody breakdown calculation
  const custodyBreakdown = useMemo(() => {
    return calculateCustodyBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Use centralized allocation breakdown calculation
  const allocationBreakdown = useMemo(() => {
    return calculateAllocationBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Use centralized risk profile calculation
  const riskProfileBreakdown = useMemo(() => {
    return calculateRiskProfile(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Use centralized metrics (already calculated in exposureData)
  const debtRatio = exposureMetrics.debtRatio;
  const uniqueAssetCount = concentrationMetrics.assetCount;
  const hhiIndex = concentrationMetrics.herfindahlIndex;

  const hasData = positions.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
            <TrendingUp className="w-10 h-10 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No positions yet</h2>
          <p className="text-[var(--foreground-muted)] text-center max-w-md">
            Add your first position to start tracking your portfolio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <h1 className="text-2xl font-semibold">Overview</h1>

      {/* Hero Section: Net Worth + Chart */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET WORTH</p>
          <h2 className="text-3xl font-semibold mb-3">
            {hideBalances ? '••••••••' : formatCurrency(summary.totalValue)}
          </h2>
          <div className="flex items-center gap-3">
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

      {/* 3 Donut Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Allocation Breakdown */}
        <DonutChart
          title="Allocation"
          data={allocationBreakdown.map(item => ({
            label: item.label,
            value: item.value,
            color: item.color,
          }))}
          hideValues={hideBalances}
          maxItems={5}
        />

        {/* Custody Breakdown */}
        <DonutChart
          title="Custody"
          data={custodyBreakdown.map(item => ({
            label: item.label,
            value: item.value,
            color: item.color,
          }))}
          hideValues={hideBalances}
          maxItems={5}
        />

        {/* Risk Profile */}
        <DonutChart
          title="Risk Profile"
          data={riskProfileBreakdown.map(item => ({
            label: item.label,
            value: item.value,
            color: item.color,
          }))}
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
