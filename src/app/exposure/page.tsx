'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary } from '@/services';
import Header from '@/components/Header';
import { useRefresh } from '@/components/PortfolioProvider';
import {
  formatCurrency,
  formatPercent,
  getChangeColor,
} from '@/lib/utils';

export default function ExposurePage() {
  const { positions, prices } = usePortfolioStore();
  const { refresh } = useRefresh();

  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices);
  }, [positions, prices]);

  // Group by asset type
  const exposureByType = useMemo(() => {
    const types = [
      { type: 'crypto', label: 'Crypto', value: summary.cryptoValue },
      { type: 'stock', label: 'Stocks', value: summary.stockValue },
      { type: 'cash', label: 'Cash', value: summary.cashValue },
      { type: 'manual', label: 'Manual', value: summary.manualValue },
    ].filter((t) => t.value > 0);

    return types.map((t) => ({
      ...t,
      percentage: summary.totalValue > 0 ? (t.value / summary.totalValue) * 100 : 0,
    }));
  }, [summary]);

  // Group assets by symbol for exposure view
  const exposureByAsset = useMemo(() => {
    const assetMap = new Map<string, { symbol: string; name: string; value: number; percentage: number }>();

    summary.topAssets.forEach((asset) => {
      const key = asset.symbol.toLowerCase();
      const existing = assetMap.get(key);

      if (existing) {
        assetMap.set(key, {
          ...existing,
          value: existing.value + asset.value,
          percentage: existing.percentage + asset.allocation,
        });
      } else {
        assetMap.set(key, {
          symbol: asset.symbol.toUpperCase(),
          name: asset.name,
          value: asset.value,
          percentage: asset.allocation,
        });
      }
    });

    return Array.from(assetMap.values()).sort((a, b) => b.value - a.value);
  }, [summary.topAssets]);

  const netExposure = summary.totalValue;
  const netExposurePercent = 100; // All spot, no futures

  return (
    <div>
      <Header title="Portfolio Exposure" onSync={refresh} />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Spot total</p>
          <p className="text-xl font-semibold">{formatCurrency(summary.totalValue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Futures</p>
          <p className="text-xl font-semibold text-[var(--positive)]">$0</p>
          <p className="text-xs text-[var(--foreground-muted)]">Long</p>
          <p className="text-xl font-semibold text-[var(--negative)]">$0</p>
          <p className="text-xs text-[var(--foreground-muted)]">Short</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Futures total</p>
          <p className="text-xl font-semibold">$0</p>
          <p className="text-xs text-[var(--foreground-muted)]">0.00% of spot total</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Net exposure (excl. stablecoins)</p>
          <p className="text-xl font-semibold">{formatCurrency(netExposure)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{netExposurePercent.toFixed(2)}% of spot total</p>
        </div>
      </div>

      {/* Exposure by asset type */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">Exposure by asset type</h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">Type</th>
              <th className="table-header text-right pb-3">Spot Assets</th>
              <th className="table-header text-right pb-3">Spot Net</th>
              <th className="table-header text-right pb-3">Futures Long / Short</th>
              <th className="table-header text-right pb-3">Net Exposure</th>
            </tr>
          </thead>
          <tbody>
            {exposureByType.map((type) => (
              <tr
                key={type.type}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-3">{type.label}</td>
                <td className="py-3 text-right">{formatCurrency(type.value)}</td>
                <td className="py-3 text-right">{formatCurrency(type.value)}</td>
                <td className="py-3 text-right text-[var(--foreground-muted)]">
                  <span className="text-[var(--positive)]">$0</span>
                  {' / '}
                  <span className="text-[var(--negative)]">$0</span>
                </td>
                <td className="py-3 text-right">
                  <span className="text-[var(--positive)]">{formatCurrency(type.value)}</span>
                  <span className="text-[var(--foreground-muted)] ml-2">
                    {type.percentage.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exposure by asset */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Exposure by asset</h3>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-sm bg-[var(--tag-bg)] rounded">
              Type
            </button>
            <button className="px-3 py-1 text-sm bg-[var(--accent-primary)] text-white rounded">
              9
            </button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">Asset</th>
              <th className="table-header text-right pb-3">Spot Assets / Liabilities</th>
              <th className="table-header text-right pb-3">Spot Net</th>
              <th className="table-header text-right pb-3">Futures Long / Short</th>
              <th className="table-header text-right pb-3">Net Exposure</th>
            </tr>
          </thead>
          <tbody>
            {exposureByAsset.slice(0, 15).map((asset) => (
              <tr
                key={asset.symbol}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                      {asset.symbol.slice(0, 1)}
                    </div>
                    <span className="tag">{asset.symbol}</span>
                  </div>
                </td>
                <td className="py-3 text-right">
                  {formatCurrency(asset.value)} / $0
                </td>
                <td className="py-3 text-right">{formatCurrency(asset.value)}</td>
                <td className="py-3 text-right text-[var(--foreground-muted)]">
                  <span className="text-[var(--positive)]">$0</span>
                  {' / '}
                  <span className="text-[var(--negative)]">$0</span>
                </td>
                <td className="py-3 text-right">
                  <span className="text-[var(--positive)]">{formatCurrency(asset.value)}</span>
                  <span className="text-[var(--foreground-muted)] ml-2">
                    {asset.percentage.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
