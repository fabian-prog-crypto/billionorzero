'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, filterPerpPositions, detectPerpTrade } from '@/services';
import Header from '@/components/Header';
import { formatCurrency, formatNumber, formatPercent, getChangeColor } from '@/lib/utils';
import { getCategoryService } from '@/services';
import { Wallet, TrendingUp } from 'lucide-react';

export default function PerpsPage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();

  // Calculate all positions with prices (including custom price overrides)
  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized exposure calculation
  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const { perpsBreakdown, perpsMetrics } = exposureData;

  // Filter to only perp positions (using shared helper for consistency)
  const perpPositions = useMemo(() => {
    return filterPerpPositions(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Group positions by exchange
  const positionsByExchange = useMemo(() => {
    const grouped: Record<string, typeof perpPositions> = {};

    perpPositions.forEach((p) => {
      const exchange = p.protocol || 'Unknown';
      if (!grouped[exchange]) {
        grouped[exchange] = [];
      }
      grouped[exchange].push(p);
    });

    return grouped;
  }, [perpPositions]);

  // Use centralized detectPerpTrade helper
  const isPerpTradePosition = (p: typeof perpPositions[0]) => detectPerpTrade(p.name).isPerpTrade;

  // Calculate stats per exchange
  const exchangeStats = useMemo(() => {
    return Object.entries(positionsByExchange).map(([exchange, positions]) => {
      const margin = positions
        .filter((p) => {
          const cat = getCategoryService().getSubCategory(p.symbol, p.type);
          return (cat === 'stablecoins' ) && !p.isDebt;
        })
        .reduce((sum, p) => sum + p.value, 0);

      // Only count actual perp trades as longs/shorts (not spot holdings)
      const longs = positions
        .filter((p) => {
          const cat = getCategoryService().getSubCategory(p.symbol, p.type);
          return cat !== 'stablecoins' && !p.isDebt && isPerpTradePosition(p);
        })
        .reduce((sum, p) => sum + p.value, 0);

      const shorts = positions
        .filter((p) => {
          const cat = getCategoryService().getSubCategory(p.symbol, p.type);
          return cat !== 'stablecoins' && p.isDebt && isPerpTradePosition(p);
        })
        .reduce((sum, p) => sum + Math.abs(p.value), 0);

      // Spot holdings (non-stablecoin, non-perp assets on the exchange)
      const spot = positions
        .filter((p) => {
          const cat = getCategoryService().getSubCategory(p.symbol, p.type);
          return cat !== 'stablecoins' && !isPerpTradePosition(p);
        })
        .reduce((sum, p) => sum + p.value, 0);

      const net = margin + spot + longs - shorts;

      return {
        exchange,
        margin,
        spot,
        longs,
        shorts,
        net,
        positionCount: positions.length,
      };
    }).sort((a, b) => b.net - a.net);
  }, [positionsByExchange]);

  // Separate margin, trading positions, and spot holdings for display
  const marginPositions = perpPositions.filter((p) => {
    const cat = getCategoryService().getSubCategory(p.symbol, p.type);
    return cat === 'stablecoins';
  });

  // Actual perp trades (Long/Short positions) - use centralized detectPerpTrade
  const tradingPositions = perpPositions.filter((p) => {
    const cat = getCategoryService().getSubCategory(p.symbol, p.type);
    return cat !== 'stablecoins' && isPerpTradePosition(p);
  });

  // Spot holdings on perp exchanges (not stablecoins, not perp trades)
  const spotHoldings = perpPositions.filter((p) => {
    const cat = getCategoryService().getSubCategory(p.symbol, p.type);
    return cat !== 'stablecoins' && !isPerpTradePosition(p);
  });

  const hasPerps = perpsBreakdown.total !== 0 || perpPositions.length > 0;

  return (
    <div>
      <Header title="Perps Overview" />

      {!hasPerps ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-[var(--background-secondary)] rounded-full flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-[var(--foreground-muted)]" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No perpetual positions</h3>
          <p className="text-[var(--foreground-muted)] text-center max-w-md">
            Connect a wallet with positions on Hyperliquid, Lighter, or Ethereal to see them here.
          </p>
        </div>
      ) : (
        <>
          {/* Professional Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">COLLATERAL</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.collateral)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">Margin deposited</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">GROSS NOTIONAL</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.grossNotional)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">|Long| + |Short|</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET NOTIONAL</p>
              <p className={`text-xl font-semibold ${perpsMetrics.netNotional >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.netNotional)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)]">{perpsMetrics.netNotional >= 0 ? 'Net Long' : 'Net Short'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">UTILIZATION</p>
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
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">LONG NOTIONAL</p>
              <p className="text-xl font-semibold text-[var(--positive)]">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.longNotional)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">SHORT NOTIONAL</p>
              <p className="text-xl font-semibold text-[var(--negative)]">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.shortNotional)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">EST. MARGIN USED</p>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(perpsMetrics.marginUsed)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">MARGIN AVAILABLE</p>
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
                    <th className="table-header text-right pb-3">Net Value</th>
                    <th className="table-header text-right pb-3">Positions</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeStats.map((stat) => (
                    <tr key={stat.exchange} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3">
                        <span className="font-medium">{stat.exchange}</span>
                      </td>
                      <td className="py-3 text-right">
                        {hideBalances ? '****' : formatCurrency(stat.margin)}
                      </td>
                      <td className="py-3 text-right text-[var(--accent-primary)]">
                        {hideBalances ? '****' : stat.spot > 0 ? formatCurrency(stat.spot) : '-'}
                      </td>
                      <td className="py-3 text-right text-[var(--positive)]">
                        {hideBalances ? '****' : stat.longs > 0 ? formatCurrency(stat.longs) : '-'}
                      </td>
                      <td className="py-3 text-right text-[var(--negative)]">
                        {hideBalances ? '****' : stat.shorts > 0 ? `-${formatCurrency(stat.shorts)}` : '-'}
                      </td>
                      <td className={`py-3 text-right font-semibold ${stat.net >= 0 ? '' : 'text-[var(--negative)]'}`}>
                        {hideBalances ? '****' : formatCurrency(stat.net)}
                      </td>
                      <td className="py-3 text-right text-[var(--foreground-muted)]">
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
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${
                              position.isDebt ? 'bg-[var(--negative)]' : 'bg-[var(--positive)]'
                            }`}>
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 text-xs font-semibold rounded ${
                            position.isDebt
                              ? 'bg-[var(--negative-light)] text-[var(--negative)]'
                              : 'bg-[var(--positive-light)] text-[var(--positive)]'
                          }`}>
                            {position.isDebt ? 'SHORT' : 'LONG'}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                        </td>
                        <td className={`py-3 text-right font-semibold ${position.isDebt ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
                          {hideBalances ? '****' : formatCurrency(position.value)}
                        </td>
                        <td className={`py-3 text-right ${getChangeColor(position.changePercent24h)}`}>
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
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-3 text-right font-semibold">
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
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--accent-primary)] text-white rounded-full flex items-center justify-center text-xs font-semibold">
                              {position.symbol.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{position.symbol.toUpperCase()}</p>
                              <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="tag text-xs">{position.protocol}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {hideBalances ? '***' : formatNumber(position.amount)}
                        </td>
                        <td className="py-3 text-right font-mono text-sm">
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                        </td>
                        <td className="py-3 text-right font-semibold text-[var(--accent-primary)]">
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
