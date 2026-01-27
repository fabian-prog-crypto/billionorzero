'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculatePortfolioSummary,
  calculateAllPositionsWithPrices,
  calculateExposureData,
  calculateCustodyBreakdown,
  getCategoryService,
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

  // Calculate custody breakdown for all assets (with Banks & Brokers added)
  const custodyBreakdown = useMemo(() => {
    const custodyMap: Record<string, { value: number; color: string }> = {
      'DeFi': { value: 0, color: '#9C27B0' },
      'Banks & Brokers': { value: 0, color: '#2196F3' },
      'Self-Custody': { value: 0, color: '#4CAF50' },
      'Manual': { value: 0, color: '#607D8B' },
      'CEX': { value: 0, color: '#FF9800' },
    };

    allAssetsWithPrices.forEach((asset) => {
      const value = Math.abs(asset.value);

      if (asset.protocol?.startsWith('cex:')) {
        custodyMap['CEX'].value += value;
      } else if (asset.type === 'stock' || asset.type === 'cash') {
        // Stocks and cash typically held at banks/brokers
        custodyMap['Banks & Brokers'].value += value;
      } else if (asset.walletAddress) {
        if (asset.protocol && asset.protocol !== 'wallet') {
          custodyMap['DeFi'].value += value;
        } else {
          custodyMap['Self-Custody'].value += value;
        }
      } else {
        custodyMap['Manual'].value += value;
      }
    });

    const total = Object.values(custodyMap).reduce((sum, item) => sum + item.value, 0);

    return Object.entries(custodyMap)
      .filter(([_, item]) => item.value > 0)
      .map(([label, item]) => ({
        label,
        value: item.value,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
        color: item.color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices]);

  // Calculate allocation breakdown (Cash & Equivalents, Crypto, Equities)
  const allocationBreakdown = useMemo(() => {
    const categoryService = getCategoryService();
    const allocationMap: Record<string, { value: number; color: string }> = {
      'Cash & Equivalents': { value: 0, color: '#4CAF50' },
      'Crypto': { value: 0, color: '#FF9800' },
      'Equities': { value: 0, color: '#F44336' },
    };

    allAssetsWithPrices.forEach((asset) => {
      const value = Math.abs(asset.value);
      const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);

      if (mainCat === 'cash') {
        allocationMap['Cash & Equivalents'].value += value;
      } else if (mainCat === 'crypto') {
        // Check if stablecoin
        const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
        if (subCat === 'stablecoins') {
          allocationMap['Cash & Equivalents'].value += value;
        } else {
          allocationMap['Crypto'].value += value;
        }
      } else if (mainCat === 'equities') {
        allocationMap['Equities'].value += value;
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
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices]);

  // Calculate risk profile breakdown
  const riskProfileBreakdown = useMemo(() => {
    const categoryService = getCategoryService();
    const riskMap: Record<string, { value: number; color: string }> = {
      'Conservative': { value: 0, color: '#4CAF50' },
      'Moderate': { value: 0, color: '#2196F3' },
      'Aggressive': { value: 0, color: '#F44336' },
    };

    allAssetsWithPrices.forEach((asset) => {
      const value = Math.abs(asset.value);
      const mainCat = categoryService.getMainCategory(asset.symbol, asset.type);
      const subCat = categoryService.getSubCategory(asset.symbol, asset.type);

      // Conservative: Cash, stablecoins, bonds
      if (mainCat === 'cash' || subCat === 'stablecoins') {
        riskMap['Conservative'].value += value;
      }
      // Moderate: Large cap crypto (BTC, ETH), blue chip stocks
      else if (subCat === 'btc' || subCat === 'eth' || mainCat === 'equities') {
        riskMap['Moderate'].value += value;
      }
      // Aggressive: Altcoins, DeFi, perps
      else {
        riskMap['Aggressive'].value += value;
      }
    });

    const total = Object.values(riskMap).reduce((sum, item) => sum + item.value, 0);

    return Object.entries(riskMap)
      .filter(([_, item]) => item.value > 0)
      .map(([label, item]) => ({
        label,
        value: item.value,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
        color: item.color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [allAssetsWithPrices]);

  // Calculate debt ratio
  const debtRatio = useMemo(() => {
    const totalDebts = allAssetsWithPrices
      .filter(a => a.value < 0)
      .reduce((sum, a) => sum + Math.abs(a.value), 0);
    const grossAssets = allAssetsWithPrices
      .filter(a => a.value > 0)
      .reduce((sum, a) => sum + a.value, 0);
    return grossAssets > 0 ? (totalDebts / grossAssets) * 100 : 0;
  }, [allAssetsWithPrices]);

  // Count unique assets
  const uniqueAssetCount = useMemo(() => {
    const symbols = new Set(allAssetsWithPrices.map(a => a.symbol.toLowerCase()));
    return symbols.size;
  }, [allAssetsWithPrices]);

  // Calculate HHI Index (Herfindahl-Hirschman Index)
  const hhiIndex = useMemo(() => {
    const totalValue = allAssetsWithPrices.reduce((sum, a) => sum + Math.abs(a.value), 0);
    if (totalValue === 0) return 0;

    // Group by symbol and calculate market shares
    const symbolValues: Record<string, number> = {};
    allAssetsWithPrices.forEach(a => {
      const symbol = a.symbol.toLowerCase();
      symbolValues[symbol] = (symbolValues[symbol] || 0) + Math.abs(a.value);
    });

    // HHI = sum of squared market shares (in percentage)
    let hhi = 0;
    Object.values(symbolValues).forEach(value => {
      const share = (value / totalValue) * 100;
      hhi += share * share;
    });

    return Math.round(hhi);
  }, [allAssetsWithPrices]);

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
