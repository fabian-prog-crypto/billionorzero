'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, aggregatePositionsBySymbol } from '@/services';
import Header from '@/components/Header';
import { useRefresh } from '@/components/PortfolioProvider';
import { formatCurrency } from '@/lib/utils';
import { Info } from 'lucide-react';

export default function ExposurePage() {
  const { positions, prices, customPrices } = usePortfolioStore();
  const { refresh } = useRefresh();

  // Calculate all positions with prices (including custom price overrides)
  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized exposure calculation - single source of truth
  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const {
    categories,
    perpsBreakdown,
    totalValue,
    grossAssets,
    totalDebts,
    simpleBreakdown,
    exposureMetrics,
    perpsMetrics,
    concentrationMetrics,
    spotDerivatives,
  } = exposureData;

  // Group assets by symbol for exposure view
  const exposureByAsset = useMemo(() => {
    return aggregatePositionsBySymbol(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Get values from simple breakdown
  const cashItem = simpleBreakdown.find(s => s.id === 'cash');
  const btcItem = simpleBreakdown.find(s => s.id === 'btc');
  const ethItem = simpleBreakdown.find(s => s.id === 'eth');
  const tokensItem = simpleBreakdown.find(s => s.id === 'tokens');

  return (
    <div>
      <Header title="Portfolio Exposure" onSync={refresh} />

      {/* Professional Exposure Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Gross Exposure</p>
          <p className="text-xl font-semibold">{formatCurrency(exposureMetrics.grossExposure)}</p>
          <div className="flex gap-2 text-xs mt-1">
            <span className="text-[var(--positive)]">L: {formatCurrency(exposureMetrics.longExposure)}</span>
            <span className="text-[var(--negative)]">S: {formatCurrency(exposureMetrics.shortExposure)}</span>
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Net Exposure</p>
          <p className={`text-xl font-semibold ${exposureMetrics.netExposure >= 0 ? '' : 'text-[var(--negative)]'}`}>
            {formatCurrency(exposureMetrics.netExposure)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {exposureMetrics.netExposure >= 0 ? 'Net Long' : 'Net Short'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Leverage</p>
          <p className={`text-xl font-semibold ${
            exposureMetrics.leverage > 2 ? 'text-[var(--negative)]' :
            exposureMetrics.leverage > 1.5 ? 'text-[var(--warning)]' : ''
          }`}>
            {exposureMetrics.leverage.toFixed(2)}x
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Gross / Net Worth
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Cash Position</p>
          <p className="text-xl font-semibold">{formatCurrency(exposureMetrics.cashPosition)}</p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {exposureMetrics.cashPercentage.toFixed(1)}% of gross assets
          </p>
        </div>
      </div>

      {/* Simple Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#10B981' }} />
            <p className="text-sm text-[var(--foreground-muted)]">Cash & Equivalents</p>
          </div>
          <p className="text-xl font-semibold">{formatCurrency(cashItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(cashItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#F7931A' }} />
            <p className="text-sm text-[var(--foreground-muted)]">BTC</p>
          </div>
          <p className="text-xl font-semibold">{formatCurrency(btcItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(btcItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#627EEA' }} />
            <p className="text-sm text-[var(--foreground-muted)]">ETH</p>
          </div>
          <p className="text-xl font-semibold">{formatCurrency(ethItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(ethItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22D3EE' }} />
            <p className="text-sm text-[var(--foreground-muted)]">Tokens</p>
          </div>
          <p className="text-xl font-semibold">{formatCurrency(tokensItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(tokensItem?.percentage || 0).toFixed(1)}%</p>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Gross Assets</p>
          <p className="text-xl font-semibold">{formatCurrency(grossAssets)}</p>
        </div>
        <div className="card bg-[var(--negative-light)]">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Total Debt</p>
          <p className="text-xl font-semibold text-[var(--negative)]">
            {totalDebts > 0 ? `-${formatCurrency(totalDebts)}` : '$0'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Net Worth</p>
          <p className="text-xl font-semibold">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      {/* Spot vs Derivatives Breakdown */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">Spot vs Derivatives</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Spot */}
          <div className="p-4 bg-[var(--background-secondary)] rounded-lg">
            <p className="font-medium mb-3">Spot Positions</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Long</span>
                <span className="text-[var(--positive)]">{formatCurrency(spotDerivatives.spotLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Short (Borrowed)</span>
                <span className="text-[var(--negative)]">{formatCurrency(spotDerivatives.spotShort)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="font-medium">Net Spot</span>
                <span className="font-semibold">{formatCurrency(spotDerivatives.spotNet)}</span>
              </div>
            </div>
          </div>
          {/* Derivatives */}
          <div className="p-4 bg-[var(--background-secondary)] rounded-lg">
            <p className="font-medium mb-3">Derivatives (Perps)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Long Notional</span>
                <span className="text-[var(--positive)]">{formatCurrency(spotDerivatives.derivativesLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Short Notional</span>
                <span className="text-[var(--negative)]">{formatCurrency(spotDerivatives.derivativesShort)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Collateral</span>
                <span>{formatCurrency(spotDerivatives.derivativesCollateral)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="font-medium">Net Derivatives</span>
                <span className="font-semibold">{formatCurrency(spotDerivatives.derivativesNet)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Concentration Risk */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">Concentration Risk</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Top Position</p>
            <p className={`text-lg font-semibold ${concentrationMetrics.top1Percentage > 30 ? 'text-[var(--warning)]' : ''}`}>
              {concentrationMetrics.top1Percentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Top 5</p>
            <p className="text-lg font-semibold">{concentrationMetrics.top5Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Top 10</p>
            <p className="text-lg font-semibold">{concentrationMetrics.top10Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">HHI</p>
            <p className={`text-lg font-semibold ${
              concentrationMetrics.herfindahlIndex > 2500 ? 'text-[var(--negative)]' :
              concentrationMetrics.herfindahlIndex > 1500 ? 'text-[var(--warning)]' : ''
            }`}>
              {concentrationMetrics.herfindahlIndex}
            </p>
          </div>
        </div>
        <p className="text-xs text-[var(--foreground-muted)] mt-3">
          {concentrationMetrics.positionCount} positions across {concentrationMetrics.assetCount} unique assets
        </p>
      </div>

      {/* Main Categories with Sub-categories */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">Exposure by Category</h3>
        <div className="table-scroll">
          <div className="min-w-[500px] space-y-4">
            {categories.map((cat) => (
              <div key={cat.category}>
                {/* Main category row */}
                <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-semibold">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-4 lg:gap-8 text-sm">
                    <span className="text-[var(--foreground-muted)] w-20 lg:w-24 text-right">
                      {formatCurrency(cat.grossAssets)}
                    </span>
                    <span className="text-[var(--negative)] w-20 lg:w-24 text-right">
                      {cat.debts > 0 ? `-${formatCurrency(cat.debts)}` : '-'}
                    </span>
                    <span className={`font-semibold w-20 lg:w-24 text-right ${cat.value >= 0 ? '' : 'text-[var(--negative)]'}`}>
                      {formatCurrency(cat.value)}
                    </span>
                    <span className="text-[var(--foreground-muted)] w-12 lg:w-16 text-right">
                      {cat.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Sub-categories */}
                {cat.subCategories.length > 0 && (
                  <div className="ml-5 border-l-2 border-[var(--border)] pl-4 py-2 space-y-2">
                    {cat.subCategories.map((sub) => (
                      <div key={sub.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: sub.color }}
                          />
                          <span className="text-[var(--foreground-muted)]">{sub.label}</span>
                        </div>
                        <div className="flex items-center gap-4 lg:gap-8">
                          <span className="text-[var(--foreground-muted)] w-20 lg:w-24 text-right">
                            {formatCurrency(sub.grossAssets)}
                          </span>
                          <span className="text-[var(--negative)] w-20 lg:w-24 text-right">
                            {sub.debts > 0 ? `-${formatCurrency(sub.debts)}` : '-'}
                          </span>
                          <span className={`w-20 lg:w-24 text-right ${sub.value >= 0 ? '' : 'text-[var(--negative)]'}`}>
                            {formatCurrency(sub.value)}
                          </span>
                          <span className="text-[var(--foreground-muted)] w-12 lg:w-16 text-right">
                            {sub.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Header for reference */}
            <div className="flex items-center justify-end gap-4 lg:gap-8 text-xs text-[var(--foreground-muted)] mt-4 pt-2 border-t border-[var(--border)]">
              <span className="w-20 lg:w-24 text-right">Gross</span>
              <span className="w-20 lg:w-24 text-right">Debt</span>
              <span className="w-20 lg:w-24 text-right">Net</span>
              <span className="w-12 lg:w-16 text-right">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Professional Perps Metrics */}
      {(perpsMetrics.collateral > 0 || perpsMetrics.grossNotional > 0) && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Perpetual Positions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-[var(--background-secondary)] rounded-lg">
              <p className="text-sm text-[var(--foreground-muted)] mb-1">Collateral</p>
              <p className="text-lg font-semibold">{formatCurrency(perpsMetrics.collateral)}</p>
              <p className="text-xs text-[var(--foreground-muted)]">Margin deposited</p>
            </div>
            <div className="p-4 bg-[var(--background-secondary)] rounded-lg">
              <p className="text-sm text-[var(--foreground-muted)] mb-1">Gross Notional</p>
              <p className="text-lg font-semibold">{formatCurrency(perpsMetrics.grossNotional)}</p>
              <p className="text-xs text-[var(--foreground-muted)]">|Long| + |Short|</p>
            </div>
            <div className="p-4 bg-[var(--background-secondary)] rounded-lg">
              <p className="text-sm text-[var(--foreground-muted)] mb-1">Net Notional</p>
              <p className={`text-lg font-semibold ${perpsMetrics.netNotional >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                {formatCurrency(perpsMetrics.netNotional)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">{perpsMetrics.netNotional >= 0 ? 'Net Long' : 'Net Short'}</p>
            </div>
            <div className="p-4 bg-[var(--background-secondary)] rounded-lg relative group">
              <p className="text-sm text-[var(--foreground-muted)] mb-1 flex items-center gap-1">
                Est. Utilization
                <Info className="w-3 h-3 text-amber-500" />
              </p>
              <p className={`text-lg font-semibold ${
                perpsMetrics.utilizationRate > 80 ? 'text-[var(--negative)]' :
                perpsMetrics.utilizationRate > 60 ? 'text-[var(--warning)]' : 'text-amber-600'
              }`}>
                ~{perpsMetrics.utilizationRate.toFixed(0)}%
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Based on 5x leverage</p>
              <div className="tooltip whitespace-normal max-w-[200px]">
                Estimated margin utilization. Actual rates depend on exchange-specific leverage limits.
              </div>
            </div>
          </div>
          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--foreground-muted)]">Long Notional</span>
              <span className="text-[var(--positive)]">{formatCurrency(perpsMetrics.longNotional)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--foreground-muted)]">Short Notional</span>
              <span className="text-[var(--negative)]">{formatCurrency(perpsMetrics.shortNotional)}</span>
            </div>
            <div className="flex justify-between text-sm group relative">
              <span className="text-[var(--foreground-muted)] flex items-center gap-1">
                Est. Margin Used
                <Info className="w-3 h-3 text-amber-500" />
              </span>
              <span className="text-amber-600">{formatCurrency(perpsMetrics.marginUsed)}</span>
              <div className="tooltip whitespace-normal max-w-[250px]">
                <p className="font-medium mb-1">Estimated at 5x average leverage</p>
                <p className="text-xs">Actual margin requirements vary by exchange, asset, and position size. This is a conservative estimate assuming 20% margin requirement.</p>
              </div>
            </div>
            <div className="flex justify-between text-sm group relative">
              <span className="text-[var(--foreground-muted)] flex items-center gap-1">
                Est. Available
                <Info className="w-3 h-3 text-amber-500" />
              </span>
              <span className={`${perpsMetrics.marginAvailable < perpsMetrics.collateral * 0.2 ? 'text-[var(--warning)]' : 'text-amber-600'}`}>
                {formatCurrency(perpsMetrics.marginAvailable)}
              </span>
              <div className="tooltip whitespace-normal max-w-[250px]">
                <p className="text-xs">Collateral minus estimated margin used. Check your exchange for actual available margin.</p>
              </div>
            </div>
          </div>

          {/* Estimation Notice */}
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Margin calculations are <strong>estimates</strong> based on 5x average leverage (20% margin).
              Actual requirements vary by exchange (Hyperliquid, Lighter, Ethereal), asset type, and position size.
              Always check your exchange for accurate margin information.
            </p>
          </div>
        </div>
      )}

      {/* Exposure by asset */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Exposure by Asset</h3>
          <span className="text-sm text-[var(--foreground-muted)]">
            {exposureByAsset.length} assets
          </span>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {exposureByAsset.slice(0, 20).map((asset) => (
                <tr
                  key={asset.symbol}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                        {asset.symbol.slice(0, 1)}
                      </div>
                      <span className="tag">{asset.symbol.toUpperCase()}</span>
                      {asset.isDebt && (
                        <span className="text-xs text-[var(--negative)]">DEBT</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <span className={asset.value >= 0 ? '' : 'text-[var(--negative)]'}>
                      {formatCurrency(asset.value)}
                    </span>
                  </td>
                  <td className="py-3 text-right text-[var(--foreground-muted)]">
                    {asset.allocation.toFixed(1)}%
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
