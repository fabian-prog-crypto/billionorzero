'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, calculatePerpPageData, filterDustPositions, DUST_THRESHOLD } from '@/services';
import { formatCurrency, formatNumber, formatPercent, getChangeColor } from '@/lib/utils';
import { Wallet, TrendingUp, Eye, EyeOff } from 'lucide-react';

export default function PerpsPage() {
  const { positions, prices, customPrices, hideBalances, hideDust, toggleHideDust } = usePortfolioStore();

  // Calculate all positions with prices (including custom price overrides)
  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized exposure calculation for metrics
  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Use centralized perp page data calculation - SINGLE SOURCE OF TRUTH
  const perpPageData = useMemo(() => {
    return calculatePerpPageData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const { perpsBreakdown, perpsMetrics } = exposureData;
  const {
    marginPositions: rawMarginPositions,
    tradingPositions: rawTradingPositions,
    spotHoldings: rawSpotHoldings,
    exchangeStats,
    hasPerps,
  } = perpPageData;

  // Apply dust filter to position lists
  const marginPositions = useMemo(() => filterDustPositions(rawMarginPositions, hideDust), [rawMarginPositions, hideDust]);
  const tradingPositions = useMemo(() => filterDustPositions(rawTradingPositions, hideDust), [rawTradingPositions, hideDust]);
  const spotHoldings = useMemo(() => filterDustPositions(rawSpotHoldings, hideDust), [rawSpotHoldings, hideDust]);

  return (
    <div>
      {!hasPerps ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 bg-[var(--background-secondary)]  flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h3 className="text-[15px] font-semibold mb-2">No perpetual positions</h3>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Connect a wallet with positions on Hyperliquid, Lighter, or Ethereal to see them here.
          </p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="flex justify-end mb-4">
            <button
              onClick={toggleHideDust}
              className={`btn p-2 flex items-center gap-1.5 ${hideDust ? 'btn-primary' : 'btn-secondary'}`}
              title={hideDust ? `Showing positions ≥$${DUST_THRESHOLD}` : 'Hide dust positions'}
            >
              {hideDust ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="text-xs">Dust</span>
            </button>
          </div>

          {/* Professional Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">COLLATERAL</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.collateral)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Margin deposited</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">GROSS NOTIONAL</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.grossNotional)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">|Long| + |Short|</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">NET NOTIONAL</p>
              <p className={`text-xl font-semibold ${perpsMetrics.netNotional >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.netNotional)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">{perpsMetrics.netNotional >= 0 ? 'Net Long' : 'Net Short'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">UTILIZATION</p>
              <p className={`text-xl font-semibold ${
                perpsMetrics.utilizationRate > 80 ? 'text-[var(--negative)]' :
                perpsMetrics.utilizationRate > 60 ? 'text-[var(--warning)]' : ''
              }`}>
                {perpsMetrics.utilizationRate.toFixed(1)}%
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Margin used</p>
            </div>
          </div>

          {/* Long/Short Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">LONG NOTIONAL</p>
              <p className="text-xl font-semibold text-[var(--positive)]">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.longNotional)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">SHORT NOTIONAL</p>
              <p className="text-xl font-semibold text-[var(--negative)]">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.shortNotional)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">EST. MARGIN USED</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.marginUsed)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">MARGIN AVAILABLE</p>
              <p className={`text-xl font-semibold ${perpsMetrics.marginAvailable < perpsMetrics.collateral * 0.2 ? 'text-[var(--warning)]' : ''}`}>
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.marginAvailable)}
              </p>
            </div>
          </div>

          <hr className="border-[var(--border)] mb-6" />

          {/* Exchange breakdown */}
          {exchangeStats.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[15px] font-medium mb-4">By Exchange</h3>
              <div className="table-scroll">
              <table className="w-full min-w-[650px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left pb-3">Exchange</th>
                    <th className="table-header text-right pb-3">Margin</th>
                    <th className="table-header text-right pb-3">Spot</th>
                    <th className="table-header text-right pb-3">Longs</th>
                    <th className="table-header text-right pb-3">Shorts</th>
                    <th className="table-header text-right pb-3">Account Value</th>
                    <th className="table-header text-right pb-3">Net Exposure</th>
                    <th className="table-header text-right pb-3">Positions</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeStats.map((stat) => (
                    <tr key={stat.exchange} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2">
                        <span className="font-medium">{stat.exchange}</span>
                      </td>
                      <td className="py-2 text-right">
                        {hideBalances ? '****' : formatCurrency(stat.margin)}
                      </td>
                      <td className="py-2 text-right text-[var(--accent-primary)]">
                        {hideBalances ? '****' : stat.spot > 0 ? formatCurrency(stat.spot) : '-'}
                      </td>
                      <td className="py-2 text-right text-[var(--positive)]">
                        {hideBalances ? '****' : stat.longs > 0 ? formatCurrency(stat.longs) : '-'}
                      </td>
                      <td className="py-2 text-right text-[var(--negative)]">
                        {hideBalances ? '****' : stat.shorts > 0 ? `-${formatCurrency(stat.shorts)}` : '-'}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {hideBalances ? '****' : formatCurrency(stat.accountValue)}
                      </td>
                      <td className={`py-2 text-right ${stat.netExposure >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {hideBalances ? '****' : stat.netExposure !== 0 ? formatCurrency(stat.netExposure) : '-'}
                      </td>
                      <td className="py-2 text-right text-[var(--foreground-muted)]">
                        {stat.positionCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Trading Positions */}
          {tradingPositions.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-medium">Trading Positions</h3>
                <span className="text-[13px] text-[var(--foreground-muted)]">
                  {tradingPositions.length} position{tradingPositions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="table-scroll">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left pb-3">Asset</th>
                    <th className="table-header text-left pb-3">Exchange</th>
                    <th className="table-header text-left pb-3">Side</th>
                    <th className="table-header text-right pb-3">Size</th>
                    <th className="table-header text-right pb-3">Price</th>
                    <th className="table-header text-right pb-3">Value</th>
                    <th className="table-header text-right pb-3">24h</th>
                  </tr>
                </thead>
                <tbody>
                  {tradingPositions
                    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                    .map((position) => (
                      <tr
                        key={position.id}
                        className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors`}
                      >
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6  flex items-center justify-center text-[10px] font-semibold text-white ${
                              position.isDebt ? 'bg-[var(--negative)]' : 'bg-[var(--positive)]'
                            }`}>
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-[10px] text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-1 text-xs font-semibold  ${
                            position.isDebt
                              ? 'bg-[var(--negative-light)] text-[var(--negative)]'
                              : 'bg-[var(--positive-light)] text-[var(--positive)]'
                          }`}>
                            {position.isDebt ? 'SHORT' : 'LONG'}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-2 text-right font-mono text-sm">
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                        </td>
                        <td className={`py-2 text-right font-semibold ${position.isDebt ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
                          {hideBalances ? '****' : formatCurrency(position.value)}
                        </td>
                        <td className={`py-2 text-right ${getChangeColor(position.changePercent24h)}`}>
                          {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Margin Deposits */}
          {marginPositions.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-medium">Margin Deposits</h3>
                <span className="text-[13px] text-[var(--foreground-muted)]">
                  {marginPositions.length} deposit{marginPositions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="table-scroll">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left pb-3">Asset</th>
                    <th className="table-header text-left pb-3">Exchange</th>
                    <th className="table-header text-right pb-3">Amount</th>
                    <th className="table-header text-right pb-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {marginPositions
                    .sort((a, b) => b.value - a.value)
                    .map((position) => (
                      <tr
                        key={position.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                      >
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-[var(--tag-bg)]  flex items-center justify-center text-[10px] font-semibold">
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-[10px] text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-2 text-right font-semibold">
                          {hideBalances ? '****' : formatCurrency(position.value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Spot Holdings on Perp Exchanges */}
          {spotHoldings.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-medium">Spot Holdings</h3>
                <span className="text-[13px] text-[var(--foreground-muted)]">
                  {spotHoldings.length} asset{spotHoldings.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="table-scroll">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left pb-3">Asset</th>
                    <th className="table-header text-left pb-3">Exchange</th>
                    <th className="table-header text-right pb-3">Amount</th>
                    <th className="table-header text-right pb-3">Price</th>
                    <th className="table-header text-right pb-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {spotHoldings
                    .sort((a, b) => b.value - a.value)
                    .map((position) => (
                      <tr
                        key={position.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                      >
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-[var(--accent-primary)] text-white  flex items-center justify-center text-[10px] font-semibold">
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-[10px] text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-2 text-right font-mono text-sm">
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                        </td>
                        <td className="py-2 text-right font-semibold text-[var(--accent-primary)]">
                          {hideBalances ? '****' : formatCurrency(position.value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
