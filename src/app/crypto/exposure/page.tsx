'use client';

import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCryptoBreakdown,
  calculateCryptoMetrics,
  calculateExposureBreakdown,
  calculateChainBreakdown,
  calculateCustodyBreakdown,
  calculateCryptoAllocation,
} from '@/services';
import { formatCurrency } from '@/lib/utils';
import DonutChart from '@/components/charts/DonutChart';
import { Bitcoin } from 'lucide-react';

export default function CryptoExposurePage() {
  const { positions, prices, customPrices, fxRates, hideBalances, accounts } = usePortfolioStore();

  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const cryptoBreakdown = useMemo(() => {
    return calculateCryptoBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const cryptoMetrics = useMemo(() => {
    return calculateCryptoMetrics(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const exposureBreakdown = useMemo(() => {
    return calculateExposureBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const chainBreakdown = useMemo(() => {
    return calculateChainBreakdown(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const custodyBreakdown = useMemo(() => {
    return calculateCustodyBreakdown(allAssetsWithPrices, accounts);
  }, [allAssetsWithPrices, accounts]);

  const cryptoAllocation = useMemo(() => {
    return calculateCryptoAllocation(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Concentration metrics
  const concentrationMetrics = useMemo(() => {
    const total = cryptoBreakdown.total;
    if (total === 0 || cryptoBreakdown.cryptoPositions.length === 0) {
      return { top1: 0, top5: 0, top10: 0, hhi: 0, uniqueCount: 0 };
    }

    // Aggregate by symbol
    const bySymbol = new Map<string, number>();
    cryptoBreakdown.cryptoPositions.forEach((p) => {
      const key = p.symbol.toUpperCase();
      bySymbol.set(key, (bySymbol.get(key) || 0) + p.value);
    });

    const sorted = Array.from(bySymbol.values()).sort((a, b) => b - a);
    const percentages = sorted.map((v) => (v / total) * 100);

    const top1 = percentages[0] || 0;
    const top5 = percentages.slice(0, 5).reduce((sum, p) => sum + p, 0);
    const top10 = percentages.slice(0, 10).reduce((sum, p) => sum + p, 0);
    const hhi = Math.round(percentages.reduce((sum, p) => sum + p * p, 0));

    return { top1, top5, top10, hhi, uniqueCount: bySymbol.size };
  }, [cryptoBreakdown]);

  // Map exposure breakdown to DonutChart items
  const tokenCategoryChartData = useMemo(() => {
    return exposureBreakdown.map((item) => ({
      label: item.label,
      value: item.value,
      color: item.color,
      breakdown: item.breakdown,
    }));
  }, [exposureBreakdown]);

  // Map chain breakdown to DonutChart items
  const chainChartData = useMemo(() => {
    return chainBreakdown.map((item) => ({
      label: item.label,
      value: item.value,
      color: item.color,
    }));
  }, [chainBreakdown]);

  // Map custody breakdown to DonutChart items
  const custodyChartData = useMemo(() => {
    return custodyBreakdown.map((item) => ({
      label: item.label,
      value: item.value,
      color: item.color,
      breakdown: item.breakdown,
    }));
  }, [custodyBreakdown]);

  // Empty state
  if (cryptoBreakdown.cryptoPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Bitcoin className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No crypto positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add crypto positions manually or connect a wallet to see exposure analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Crypto Dominance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL CRYPTO</p>
          <p className="text-xl font-semibold">{hideBalances ? '••••' : formatCurrency(cryptoBreakdown.total)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">
            {cryptoBreakdown.cryptoPositions.length} position{cryptoBreakdown.cryptoPositions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">STABLECOIN RATIO</p>
          <p className="text-xl font-semibold">{cryptoMetrics.stablecoinRatio.toFixed(1)}%</p>
          <p className="text-xs text-[var(--foreground-muted)]">of crypto portfolio</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">BTC DOMINANCE</p>
          <p className="text-xl font-semibold">{cryptoMetrics.btcDominance.toFixed(1)}%</p>
          <p className="text-xs text-[var(--foreground-muted)]">of crypto portfolio</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">ETH DOMINANCE</p>
          <p className="text-xl font-semibold">{cryptoMetrics.ethDominance.toFixed(1)}%</p>
          <p className="text-xs text-[var(--foreground-muted)]">of crypto portfolio</p>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Section 2: Exposure by Token Category */}
      {tokenCategoryChartData.length > 0 && (
        <>
          <div>
            <h3 className="text-[15px] font-medium mb-4">Exposure by Token Category</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <DonutChart
                  title="Token Categories"
                  data={tokenCategoryChartData}
                  maxItems={8}
                  hideValues={hideBalances}
                />
              </div>
              <div className="md:col-span-2">
                {/* Stacked allocation bar */}
                <div className="h-3 bg-[var(--background-secondary)] overflow-hidden flex">
                  {exposureBreakdown.map((item) =>
                    item.percentage > 0 ? (
                      <div
                        key={item.category}
                        className="h-full"
                        style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                      />
                    ) : null
                  )}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                  {exposureBreakdown.map((item) => (
                    <div key={item.category} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5" style={{ backgroundColor: item.color }} />
                      <span className="text-[13px] text-[var(--foreground-muted)]">
                        {item.label} {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-[var(--border)]" />
        </>
      )}

      {/* Section 3: Chain Distribution & Custody */}
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {chainChartData.length > 0 && (
            <DonutChart
              title="Chain Distribution"
              data={chainChartData}
              maxItems={7}
              hideValues={hideBalances}
            />
          )}
          {custodyChartData.length > 0 && (
            <DonutChart
              title="Custody Breakdown"
              data={custodyChartData}
              maxItems={6}
              hideValues={hideBalances}
            />
          )}
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Section 4: Concentration Risk */}
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
            <p className="text-xs text-[var(--foreground-muted)]">{concentrationMetrics.uniqueCount} unique crypto assets</p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* Section 5: Crypto Allocation Bar */}
      {cryptoAllocation.length > 0 && (
        <div>
          <h3 className="text-[15px] font-medium mb-4">Crypto Allocation</h3>
          {/* Stacked bar */}
          <div className="h-3 bg-[var(--background-secondary)] overflow-hidden flex">
            {cryptoAllocation.map((item) =>
              item.percentage > 0 ? (
                <div
                  key={item.category}
                  className="h-full"
                  style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                />
              ) : null
            )}
          </div>
          {/* Legend with values */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
            {cryptoAllocation.map((item) => (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5" style={{ backgroundColor: item.color }} />
                <span className="text-[13px] text-[var(--foreground-muted)]">
                  {item.label} {item.percentage.toFixed(1)}%
                </span>
                {!hideBalances && (
                  <span className="text-[12px] text-[var(--foreground-subtle)]">
                    {formatCurrency(item.value)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
