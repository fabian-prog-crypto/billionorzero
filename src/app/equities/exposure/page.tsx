'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateEquitiesBreakdown,
  getCategoryService,
} from '@/services';
import { formatCurrency } from '@/lib/utils';
import { SUBCATEGORY_COLORS } from '@/lib/colors';
import StockIcon from '@/components/ui/StockIcon';
import { TrendingUp } from 'lucide-react';

export default function EquitiesExposurePage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const categoryService = getCategoryService();

  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  const breakdownData = useMemo(() => {
    return calculateEquitiesBreakdown(allPositionsWithPrices);
  }, [allPositionsWithPrices]);

  // Aggregate by symbol and sort by value for exposure table
  const exposureByPosition = useMemo(() => {
    const bySymbol = new Map<string, { symbol: string; name: string; value: number; type: string }>();

    breakdownData.equityPositions.forEach((p) => {
      const existing = bySymbol.get(p.symbol.toUpperCase());
      if (existing) {
        existing.value += p.value;
      } else {
        bySymbol.set(p.symbol.toUpperCase(), {
          symbol: p.symbol,
          name: p.name,
          value: p.value,
          type: p.type,
        });
      }
    });

    return Array.from(bySymbol.values()).sort((a, b) => b.value - a.value);
  }, [breakdownData.equityPositions]);

  // Concentration metrics
  const concentrationMetrics = useMemo(() => {
    const total = breakdownData.total;
    if (total === 0 || exposureByPosition.length === 0) {
      return { top1: 0, top5: 0, top10: 0, hhi: 0 };
    }

    const percentages = exposureByPosition.map((p) => (p.value / total) * 100);

    const top1 = percentages[0] || 0;
    const top5 = percentages.slice(0, 5).reduce((sum, p) => sum + p, 0);
    const top10 = percentages.slice(0, 10).reduce((sum, p) => sum + p, 0);

    // HHI = sum of squared market shares
    const hhi = Math.round(percentages.reduce((sum, p) => sum + p * p, 0));

    return { top1, top5, top10, hhi };
  }, [exposureByPosition, breakdownData.total]);

  // Stocks vs ETFs allocation bar
  const stocksPct = breakdownData.total > 0 ? (breakdownData.stocks.value / breakdownData.total) * 100 : 0;
  const etfsPct = breakdownData.total > 0 ? (breakdownData.etfs.value / breakdownData.total) * 100 : 0;

  if (breakdownData.equityPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No equity positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add stock or ETF positions to see exposure analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL EQUITIES</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.total)}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.equities_stocks }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">STOCKS</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.stocks.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.stocks.count} position{breakdownData.stocks.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.equities_etfs }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">ETFS</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.etfs.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.etfs.count} position{breakdownData.etfs.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">POSITIONS</p>
          <p className="text-xl font-semibold">{exposureByPosition.length}</p>
          <p className="text-xs text-[var(--foreground-muted)]">unique assets</p>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Concentration Risk */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Concentration Risk</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP POSITION</p>
            <p className={`text-xl font-semibold ${concentrationMetrics.top1 > 30 ? 'text-[var(--warning)]' : ''}`}>
              {concentrationMetrics.top1.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP 5</p>
            <p className="text-xl font-semibold">{concentrationMetrics.top5.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOP 10</p>
            <p className="text-xl font-semibold">{concentrationMetrics.top10.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">HHI INDEX</p>
            <p className={`text-xl font-semibold ${
              concentrationMetrics.hhi > 2500 ? 'text-[var(--negative)]' :
              concentrationMetrics.hhi > 1500 ? 'text-[var(--warning)]' : ''
            }`}>
              {concentrationMetrics.hhi}
            </p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Stocks vs ETFs Allocation Bar */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Stocks vs ETFs</h3>
        <div className="h-3 bg-[var(--background-secondary)] overflow-hidden flex">
          {stocksPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${stocksPct}%`, backgroundColor: SUBCATEGORY_COLORS.equities_stocks }}
            />
          )}
          {etfsPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${etfsPct}%`, backgroundColor: SUBCATEGORY_COLORS.equities_etfs }}
            />
          )}
        </div>
        <div className="flex justify-between mt-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5" style={{ backgroundColor: SUBCATEGORY_COLORS.equities_stocks }} />
            <span className="text-[13px] text-[var(--foreground-muted)]">
              Stocks {stocksPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5" style={{ backgroundColor: SUBCATEGORY_COLORS.equities_etfs }} />
            <span className="text-[13px] text-[var(--foreground-muted)]">
              ETFs {etfsPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Exposure by Position */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-medium">Exposure by Position</h3>
          <span className="text-[13px] text-[var(--foreground-muted)]">
            {exposureByPosition.length} assets
          </span>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-left pb-3">Type</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">% of Equities</th>
              </tr>
            </thead>
            <tbody>
              {exposureByPosition.slice(0, 20).map((asset) => {
                const subCat = categoryService.getSubCategory(asset.symbol, asset.type);
                const isETF = subCat === 'etfs';
                const pct = breakdownData.total > 0 ? (asset.value / breakdownData.total) * 100 : 0;

                return (
                  <tr
                    key={asset.symbol}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <StockIcon symbol={asset.symbol} size={24} isETF={isETF} />
                        <div>
                          <span className="text-[13px] font-medium">{asset.symbol.toUpperCase()}</span>
                          <p className="text-[11px] text-[var(--foreground-muted)] truncate max-w-[150px]">
                            {asset.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: isETF ? `${SUBCATEGORY_COLORS.equities_etfs}1A` : `${SUBCATEGORY_COLORS.equities_stocks}1A`,
                          color: isETF ? SUBCATEGORY_COLORS.equities_etfs : SUBCATEGORY_COLORS.equities_stocks,
                        }}
                      >
                        {isETF ? 'ETF' : 'Stock'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className="text-[13px]">
                        {hideBalances ? '••••' : formatCurrency(asset.value)}
                      </span>
                    </td>
                    <td className="py-2 text-right text-[13px] text-[var(--foreground-muted)]">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
