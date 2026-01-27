'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculatePortfolioSummary,
  calculateAllPositionsWithPrices,
  calculateExposureData,
  getCategoryService,
} from '@/services';
import type { AssetWithPrice } from '@/types';
import NetWorthChart from '@/components/charts/NetWorthChart';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
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

  // Build chart data with breakdowns computed locally
  const categoryService = getCategoryService();

  // Helper to aggregate assets by symbol for breakdown
  const aggregateBySymbol = (assets: AssetWithPrice[]) => {
    const map = new Map<string, number>();
    assets.forEach(a => {
      const key = a.symbol.toUpperCase();
      map.set(key, (map.get(key) || 0) + Math.abs(a.value));
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Allocation breakdown: Cash & Equivalents, Crypto, Equities
  const allocationChartData = useMemo((): DonutChartItem[] => {
    const cashAssets: AssetWithPrice[] = [];
    const cryptoAssets: AssetWithPrice[] = [];
    const equityAssets: AssetWithPrice[] = [];

    allAssetsWithPrices.forEach(asset => {
      const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
      const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

      if (mainCat === 'cash') {
        cashAssets.push(asset);
      } else if (mainCat === 'crypto') {
        if (subCat === 'stablecoins') {
          cashAssets.push(asset);
        } else {
          cryptoAssets.push(asset);
        }
      } else if (mainCat === 'equities') {
        equityAssets.push(asset);
      }
    });

    const items: DonutChartItem[] = [];
    const cashValue = cashAssets.reduce((sum, a) => sum + Math.abs(a.value), 0);
    const cryptoValue = cryptoAssets.reduce((sum, a) => sum + Math.abs(a.value), 0);
    const equityValue = equityAssets.reduce((sum, a) => sum + Math.abs(a.value), 0);

    if (cashValue > 0) items.push({ label: 'Cash & Equivalents', value: cashValue, color: '#4CAF50', breakdown: aggregateBySymbol(cashAssets) });
    if (cryptoValue > 0) items.push({ label: 'Crypto', value: cryptoValue, color: '#FF9800', breakdown: aggregateBySymbol(cryptoAssets) });
    if (equityValue > 0) items.push({ label: 'Equities', value: equityValue, color: '#F44336', breakdown: aggregateBySymbol(equityAssets) });

    return items.sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices, categoryService]);

  // Custody breakdown: Self-Custody, DeFi, CEX, Banks & Brokers, Manual
  const custodyChartData = useMemo((): DonutChartItem[] => {
    const buckets: Record<string, { assets: AssetWithPrice[]; color: string }> = {
      'Self-Custody': { assets: [], color: '#4CAF50' },
      'DeFi': { assets: [], color: '#9C27B0' },
      'CEX': { assets: [], color: '#FF9800' },
      'Banks & Brokers': { assets: [], color: '#2196F3' },
      'Manual': { assets: [], color: '#607D8B' },
    };

    allAssetsWithPrices.forEach(asset => {
      if (asset.protocol?.startsWith('cex:')) {
        buckets['CEX'].assets.push(asset);
      } else if (asset.type === 'stock' || asset.type === 'cash') {
        buckets['Banks & Brokers'].assets.push(asset);
      } else if (asset.walletAddress) {
        if (asset.protocol && asset.protocol !== 'wallet') {
          buckets['DeFi'].assets.push(asset);
        } else {
          buckets['Self-Custody'].assets.push(asset);
        }
      } else {
        buckets['Manual'].assets.push(asset);
      }
    });

    return Object.entries(buckets)
      .filter(([_, b]) => b.assets.length > 0)
      .map(([label, b]) => ({
        label,
        value: b.assets.reduce((sum, a) => sum + Math.abs(a.value), 0),
        color: b.color,
        breakdown: aggregateBySymbol(b.assets),
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices]);

  // Risk profile breakdown: Conservative, Moderate, Aggressive
  const riskChartData = useMemo((): DonutChartItem[] => {
    const buckets: Record<string, { assets: AssetWithPrice[]; color: string }> = {
      'Conservative': { assets: [], color: '#4CAF50' },
      'Moderate': { assets: [], color: '#2196F3' },
      'Aggressive': { assets: [], color: '#F44336' },
    };

    allAssetsWithPrices.forEach(asset => {
      const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
      const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

      if (mainCat === 'cash' || subCat === 'stablecoins') {
        buckets['Conservative'].assets.push(asset);
      } else if (subCat === 'btc' || subCat === 'eth' || mainCat === 'equities') {
        buckets['Moderate'].assets.push(asset);
      } else {
        buckets['Aggressive'].assets.push(asset);
      }
    });

    return Object.entries(buckets)
      .filter(([_, b]) => b.assets.length > 0)
      .map(([label, b]) => ({
        label,
        value: b.assets.reduce((sum, a) => sum + Math.abs(a.value), 0),
        color: b.color,
        breakdown: aggregateBySymbol(b.assets),
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices, categoryService]);

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
