'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateMetalsBreakdown,
  getCategoryService,
} from '@/services';
import { formatCurrency } from '@/lib/utils';
import { SUBCATEGORY_COLORS } from '@/lib/colors';
import { TrendingUp } from 'lucide-react';

const METAL_LABELS: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  platinum: 'Platinum',
  palladium: 'Palladium',
  miners: 'Miners',
};

export default function MetalsExposurePage() {
  const { positions, prices, customPrices, fxRates, hideBalances } = usePortfolioStore();
  const categoryService = getCategoryService();

  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const breakdownData = useMemo(() => {
    return calculateMetalsBreakdown(allPositionsWithPrices);
  }, [allPositionsWithPrices]);

  const exposureByPosition = useMemo(() => {
    const bySymbol = new Map<string, { symbol: string; name: string; value: number; type: string }>();

    breakdownData.metalPositions.forEach((p) => {
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
  }, [breakdownData.metalPositions]);

  const concentrationMetrics = useMemo(() => {
    const total = breakdownData.total;
    if (total === 0 || exposureByPosition.length === 0) {
      return { top1: 0, top5: 0, top10: 0, hhi: 0 };
    }

    const percentages = exposureByPosition.map((p) => (p.value / total) * 100);

    const top1 = percentages[0] || 0;
    const top5 = percentages.slice(0, 5).reduce((sum, p) => sum + p, 0);
    const top10 = percentages.slice(0, 10).reduce((sum, p) => sum + p, 0);

    const hhi = Math.round(percentages.reduce((sum, p) => sum + p * p, 0));

    return { top1, top5, top10, hhi };
  }, [exposureByPosition, breakdownData.total]);

  const total = breakdownData.total;
  const goldPct = total > 0 ? (breakdownData.gold.value / total) * 100 : 0;
  const silverPct = total > 0 ? (breakdownData.silver.value / total) * 100 : 0;
  const platinumPct = total > 0 ? (breakdownData.platinum.value / total) * 100 : 0;
  const palladiumPct = total > 0 ? (breakdownData.palladium.value / total) * 100 : 0;
  const minersPct = total > 0 ? (breakdownData.miners.value / total) * 100 : 0;

  if (breakdownData.metalPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No metal positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add gold, silver, or metal-related positions to see exposure analysis.
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
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL METALS</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.total)}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.metals_gold }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">GOLD</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.gold.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.gold.count} position{breakdownData.gold.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.metals_silver }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">SILVER</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.silver.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.silver.count} position{breakdownData.silver.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">POSITIONS</p>
          <p className="text-xl font-semibold">{exposureByPosition.length}</p>
          <p className="text-xs text-[var(--foreground-muted)]">unique assets</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.metals_platinum }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">PLATINUM</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.platinum.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.platinum.count} position{breakdownData.platinum.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.metals_palladium }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">PALLADIUM</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.palladium.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.palladium.count} position{breakdownData.palladium.count !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2" style={{ backgroundColor: SUBCATEGORY_COLORS.metals_miners }} />
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">MINERS</p>
          </div>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(breakdownData.miners.value)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{breakdownData.miners.count} position{breakdownData.miners.count !== 1 ? 's' : ''}</p>
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

      {/* Metals Allocation Bar */}
      <div>
        <h3 className="text-[15px] font-medium mb-4">Metals Allocation</h3>
        <div className="h-3 bg-[var(--background-secondary)] overflow-hidden flex">
          {goldPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${goldPct}%`, backgroundColor: SUBCATEGORY_COLORS.metals_gold }}
            />
          )}
          {silverPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${silverPct}%`, backgroundColor: SUBCATEGORY_COLORS.metals_silver }}
            />
          )}
          {platinumPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${platinumPct}%`, backgroundColor: SUBCATEGORY_COLORS.metals_platinum }}
            />
          )}
          {palladiumPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${palladiumPct}%`, backgroundColor: SUBCATEGORY_COLORS.metals_palladium }}
            />
          )}
          {minersPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${minersPct}%`, backgroundColor: SUBCATEGORY_COLORS.metals_miners }}
            />
          )}
        </div>
        <div className="flex flex-wrap justify-between mt-2 gap-3">
          {[
            { key: 'gold', pct: goldPct, color: SUBCATEGORY_COLORS.metals_gold },
            { key: 'silver', pct: silverPct, color: SUBCATEGORY_COLORS.metals_silver },
            { key: 'platinum', pct: platinumPct, color: SUBCATEGORY_COLORS.metals_platinum },
            { key: 'palladium', pct: palladiumPct, color: SUBCATEGORY_COLORS.metals_palladium },
            { key: 'miners', pct: minersPct, color: SUBCATEGORY_COLORS.metals_miners },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5" style={{ backgroundColor: item.color }} />
              <span className="text-[13px] text-[var(--foreground-muted)]">
                {METAL_LABELS[item.key]} {item.pct.toFixed(1)}%
              </span>
            </div>
          ))}
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
                <th className="table-header text-right pb-3">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {exposureByPosition.map((p) => {
                const categoryInput = p.assetClassOverride ?? p.assetClass ?? p.type;
                const subCat = categoryService.getSubCategory(p.symbol, categoryInput);
                const subColor = SUBCATEGORY_COLORS[`metals_${subCat}` as keyof typeof SUBCATEGORY_COLORS] || SUBCATEGORY_COLORS.metals_gold;
                return (
                  <tr key={p.symbol} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 flex items-center justify-center text-[10px] font-semibold text-white"
                          style={{ backgroundColor: subColor }}
                        >
                          {p.symbol.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{p.symbol.toUpperCase()}</div>
                          <div className="text-[11px] text-[var(--foreground-muted)] truncate max-w-[150px]">{p.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${subColor}1A`, color: subColor }}
                      >
                        {METAL_LABELS[subCat] || subCat}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {hideBalances ? '••••' : formatCurrency(p.value)}
                    </td>
                    <td className="py-2 text-right text-[var(--foreground-muted)] text-xs">
                      {total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%
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
