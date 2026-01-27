'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, aggregatePositionsBySymbol } from '@/services';
import { formatCurrency } from '@/lib/utils';
import { EXPOSURE_COLORS, CRYPTO_COLORS } from '@/lib/colors';
import Alert from '@/components/ui/Alert';
import { Info } from 'lucide-react';

export default function ExposurePage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();

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
    <div className="space-y-6">
      {/* Professional Exposure Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">GROSS EXPOSURE</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(exposureMetrics.grossExposure)}</p>
          <div className="flex gap-2 text-xs mt-1">
            <span className="text-[var(--positive)]">L: {hideBalances ? '••••' : formatCurrency(exposureMetrics.longExposure)}</span>
            <span className="text-[var(--negative)]">S: {hideBalances ? '••••' : formatCurrency(exposureMetrics.shortExposure)}</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET EXPOSURE</p>
          <p className={`text-xl font-semibold ${exposureMetrics.netExposure >= 0 ? '' : 'text-[var(--negative)]'}`}>
            {hideBalances ? '••••' : formatCurrency(exposureMetrics.netExposure)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {exposureMetrics.netExposure >= 0 ? 'Net Long' : 'Net Short'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">LEVERAGE</p>
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
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">CASH POSITION</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(exposureMetrics.cashPosition)}</p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            {exposureMetrics.cashPercentage.toFixed(1)}% of gross
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Simple Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EXPOSURE_COLORS.stablecoins }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">CASH & EQUIVALENTS</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(cashItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(cashItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CRYPTO_COLORS.btc }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">BTC</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(btcItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(btcItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CRYPTO_COLORS.eth }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">ETH</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(ethItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(ethItem?.percentage || 0).toFixed(1)}%</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EXPOSURE_COLORS.other }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">TOKENS</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(tokensItem?.value || 0)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{(tokensItem?.percentage || 0).toFixed(1)}%</p>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Portfolio Summary */}
      <div className="grid grid-cols-3 gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">GROSS ASSETS</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(grossAssets)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL DEBT</p>
          <p className="text-xl font-semibold text-[var(--negative)]">
            {totalDebts > 0 ? (hideBalances ? '••••' : `-${formatCurrency(totalDebts)}`) : '$0'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET WORTH</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(totalValue)}</p>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Spot vs Derivatives Breakdown */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Spot vs Derivatives</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Spot */}
          <div>
            <p className="text-[13px] font-medium mb-3">Spot Positions</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Long</span>
                <span className="text-[var(--positive)]">{hideBalances ? '••••' : formatCurrency(spotDerivatives.spotLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Short (Borrowed)</span>
                <span className="text-[var(--negative)]">{hideBalances ? '••••' : formatCurrency(spotDerivatives.spotShort)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="font-medium">Net Spot</span>
                <span className="font-semibold">{hideBalances ? '••••' : formatCurrency(spotDerivatives.spotNet)}</span>
              </div>
            </div>
          </div>
          {/* Derivatives */}
          <div>
            <p className="text-[13px] font-medium mb-3">Derivatives (Perps)</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Long Notional</span>
                <span className="text-[var(--positive)]">{hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesLong)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Short Notional</span>
                <span className="text-[var(--negative)]">{hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesShort)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Collateral</span>
                <span>{hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesCollateral)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="font-medium">Net Derivatives</span>
                <span className="font-semibold">{hideBalances ? '••••' : formatCurrency(spotDerivatives.derivativesNet)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Concentration Risk */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Concentration Risk</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP POSITION</p>
            <p className={`text-xl font-semibold ${concentrationMetrics.top1Percentage > 30 ? 'text-[var(--warning)]' : ''}`}>
              {concentrationMetrics.top1Percentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP 5</p>
            <p className="text-xl font-semibold">{concentrationMetrics.top5Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP 10</p>
            <p className="text-xl font-semibold">{concentrationMetrics.top10Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">HHI INDEX</p>
            <p className={`text-xl font-semibold ${
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

      <hr className="border-[var(--border)]" />

      {/* Main Categories with Sub-categories */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Exposure by Category</h3>
        <div className="table-scroll">
          <div className="min-w-[500px] space-y-4">
            {categories.map((cat) => (
              <div key={cat.category}>
                {/* Main category row */}
                <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-[13px] font-semibold">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-4 lg:gap-8 text-[13px]">
                    <span className="text-[var(--foreground-muted)] w-20 lg:w-24 text-right">
                      {hideBalances ? '••••' : formatCurrency(cat.grossAssets)}
                    </span>
                    <span className="text-[var(--negative)] w-20 lg:w-24 text-right">
                      {cat.debts > 0 ? (hideBalances ? '••••' : `-${formatCurrency(cat.debts)}`) : '-'}
                    </span>
                    <span className={`font-semibold w-20 lg:w-24 text-right ${cat.value >= 0 ? '' : 'text-[var(--negative)]'}`}>
                      {hideBalances ? '••••' : formatCurrency(cat.value)}
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
                      <div key={sub.category} className="flex items-center justify-between text-[13px]">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: sub.color }}
                          />
                          <span className="text-[var(--foreground-muted)]">{sub.label}</span>
                        </div>
                        <div className="flex items-center gap-4 lg:gap-8">
                          <span className="text-[var(--foreground-muted)] w-20 lg:w-24 text-right">
                            {hideBalances ? '••••' : formatCurrency(sub.grossAssets)}
                          </span>
                          <span className="text-[var(--negative)] w-20 lg:w-24 text-right">
                            {sub.debts > 0 ? (hideBalances ? '••••' : `-${formatCurrency(sub.debts)}`) : '-'}
                          </span>
                          <span className={`w-20 lg:w-24 text-right ${sub.value >= 0 ? '' : 'text-[var(--negative)]'}`}>
                            {hideBalances ? '••••' : formatCurrency(sub.value)}
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
        <>
          <hr className="border-[var(--border)]" />
          <div>
            <h3 className="text-[15px] font-medium mb-4">Perpetual Positions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">COLLATERAL</p>
                <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(perpsMetrics.collateral)}</p>
                <p className="text-xs text-[var(--foreground-muted)]">Margin deposited</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">GROSS NOTIONAL</p>
                <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(perpsMetrics.grossNotional)}</p>
                <p className="text-xs text-[var(--foreground-muted)]">|Long| + |Short|</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET NOTIONAL</p>
                <p className={`text-xl font-semibold ${perpsMetrics.netNotional >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                  {hideBalances ? '••••' : formatCurrency(perpsMetrics.netNotional)}
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">{perpsMetrics.netNotional >= 0 ? 'Net Long' : 'Net Short'}</p>
              </div>
              <div className="relative group">
                <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1 flex items-center gap-1">
                  EST. UTILIZATION
                  <Info className="w-3 h-3 text-amber-500" />
                </p>
                <p className={`text-xl font-semibold ${
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--foreground-muted)]">Long Notional</span>
                <span className="text-[var(--positive)]">{hideBalances ? '••••' : formatCurrency(perpsMetrics.longNotional)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--foreground-muted)]">Short Notional</span>
                <span className="text-[var(--negative)]">{hideBalances ? '••••' : formatCurrency(perpsMetrics.shortNotional)}</span>
              </div>
              <div className="flex justify-between text-[13px] group relative">
                <span className="text-[var(--foreground-muted)] flex items-center gap-1">
                  Est. Margin Used
                  <Info className="w-3 h-3 text-amber-500" />
                </span>
                <span className="text-amber-600">{hideBalances ? '••••' : formatCurrency(perpsMetrics.marginUsed)}</span>
              </div>
              <div className="flex justify-between text-[13px] group relative">
                <span className="text-[var(--foreground-muted)] flex items-center gap-1">
                  Est. Available
                  <Info className="w-3 h-3 text-amber-500" />
                </span>
                <span className={`${perpsMetrics.marginAvailable < perpsMetrics.collateral * 0.2 ? 'text-[var(--warning)]' : 'text-amber-600'}`}>
                  {hideBalances ? '••••' : formatCurrency(perpsMetrics.marginAvailable)}
                </span>
              </div>
            </div>

            {/* Estimation Notice */}
            <Alert type="warning" className="mt-4">
              Margin calculations are <strong>estimates</strong> based on 5x average leverage (20% margin).
              Actual requirements vary by exchange (Hyperliquid, Lighter, Ethereal), asset type, and position size.
            </Alert>
          </div>
        </>
      )}

      <hr className="border-[var(--border)]" />

      {/* Exposure by asset */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-medium">Exposure by Asset</h3>
          <span className="text-[13px] text-[var(--foreground-muted)]">
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
                      <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                      {asset.isDebt && (
                        <span className="text-xs text-[var(--negative)]">DEBT</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <span className={`text-[13px] ${asset.value >= 0 ? '' : 'text-[var(--negative)]'}`}>
                      {hideBalances ? '••••' : formatCurrency(asset.value)}
                    </span>
                  </td>
                  <td className="py-3 text-right text-[13px] text-[var(--foreground-muted)]">
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
