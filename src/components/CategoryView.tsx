'use client';

import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
import type { AssetWithPrice } from '@/types';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCryptoMetrics,
  calculateCryptoAllocation,
  getCategoryService,
} from '@/services';
import { MainCategory } from '@/services/domain/category-service';
import { formatCurrency } from '@/lib/utils';

interface CategoryViewProps {
  category: MainCategory;
  title: string;
  description: string;
  emptyIcon: React.ReactNode;
  emptyMessage: string;
}

export default function CategoryView({
  category,
  title,
  description,
  emptyIcon,
  emptyMessage,
}: CategoryViewProps) {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();

  const categoryService = getCategoryService();

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter by category
  const categoryPositions = useMemo(() => {
    return allPositions.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      return mainCat === category;
    });
  }, [allPositions, category, categoryService]);

  // Helper to aggregate positions by symbol
  const aggregateBySymbol = (positions: AssetWithPrice[]) => {
    const map = new Map<string, number>();
    positions.forEach(p => {
      const key = p.symbol.toUpperCase();
      map.set(key, (map.get(key) || 0) + Math.abs(p.value));
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Calculate custody breakdown with local breakdown computation
  const custodyChartData = useMemo((): DonutChartItem[] => {
    const buckets: Record<string, { assets: AssetWithPrice[]; color: string }> = {
      'Self-Custody': { assets: [], color: '#4CAF50' },
      'DeFi': { assets: [], color: '#9C27B0' },
      'CEX': { assets: [], color: '#FF9800' },
      'Banks & Brokers': { assets: [], color: '#2196F3' },
      'Manual': { assets: [], color: '#607D8B' },
    };

    categoryPositions.forEach(asset => {
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
  }, [categoryPositions]);

  // Calculate chain breakdown with local breakdown computation
  const chainChartData = useMemo((): DonutChartItem[] => {
    const chainColors: Record<string, string> = {
      'eth': '#627EEA', 'ethereum': '#627EEA', 'arb': '#28A0F0', 'arbitrum': '#28A0F0',
      'op': '#FF0420', 'optimism': '#FF0420', 'base': '#0052FF', 'bsc': '#F0B90B',
      'matic': '#8247E5', 'polygon': '#8247E5', 'sol': '#9945FF', 'solana': '#9945FF',
    };

    const buckets: Record<string, { assets: AssetWithPrice[]; color: string }> = {};

    categoryPositions.forEach(asset => {
      let chain = 'Other';
      if (asset.protocol?.startsWith('cex:')) {
        chain = asset.protocol.replace('cex:', '').charAt(0).toUpperCase() + asset.protocol.replace('cex:', '').slice(1);
      } else if (asset.chain) {
        chain = asset.chain.charAt(0).toUpperCase() + asset.chain.slice(1);
      }

      if (!buckets[chain]) {
        buckets[chain] = { assets: [], color: chainColors[chain.toLowerCase()] || '#6B7280' };
      }
      buckets[chain].assets.push(asset);
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
  }, [categoryPositions]);

  // Calculate exposure breakdown with local breakdown computation
  const exposureChartData = useMemo((): DonutChartItem[] => {
    const categoryConfig: Record<string, { color: string; label: string }> = {
      stablecoins: { color: '#4CAF50', label: 'Stablecoins' },
      eth: { color: '#627EEA', label: 'ETH' },
      btc: { color: '#F7931A', label: 'BTC' },
      sol: { color: '#9945FF', label: 'SOL' },
      tokens: { color: '#00BCD4', label: 'Tokens' },
      defi: { color: '#9C27B0', label: 'DeFi' },
      other: { color: '#6B7280', label: 'Other' },
    };

    const buckets: Record<string, { assets: AssetWithPrice[]; color: string; label: string }> = {};

    categoryPositions.forEach(asset => {
      const rawSubCat = categoryService.getSubCategory(asset.symbol, asset.type);
      const subCat = categoryConfig[rawSubCat] ? rawSubCat : 'other';

      const config = categoryConfig[subCat];
      if (!buckets[subCat]) {
        buckets[subCat] = { assets: [], color: config.color, label: config.label };
      }
      buckets[subCat].assets.push(asset);
    });

    return Object.entries(buckets)
      .filter(([_, b]) => b.assets.length > 0)
      .map(([_, b]) => ({
        label: b.label,
        value: b.assets.reduce((sum, a) => sum + Math.abs(a.value), 0),
        color: b.color,
        breakdown: aggregateBySymbol(b.assets),
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryPositions, categoryService]);

  // Calculate crypto metrics
  const cryptoMetrics = useMemo(() => {
    return calculateCryptoMetrics(categoryPositions);
  }, [categoryPositions]);

  // Calculate crypto allocation
  const cryptoAllocation = useMemo(() => {
    return calculateCryptoAllocation(categoryPositions);
  }, [categoryPositions]);

  // Calculate totals
  const totalValue = categoryPositions.reduce((sum, p) => sum + p.value, 0);
  const totalGrossAssets = categoryPositions.filter(p => p.value > 0).reduce((sum, p) => sum + p.value, 0);

  if (categoryPositions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
          {emptyIcon}
        </div>
        <h2 className="text-xl font-semibold mb-2">No {title.toLowerCase()} positions</h2>
        <p className="text-[var(--foreground-muted)] text-center max-w-md">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">{title.toUpperCase()}</p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(totalValue)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {description}
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Assets</p>
            <p className="text-[13px] font-medium">
              {hideBalances ? '••••' : formatCurrency(totalGrossAssets)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Positions</p>
            <p className="text-[13px] font-medium">{categoryPositions.length}</p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)]" />

      {/* 3 Donut Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Custody Breakdown */}
        <DonutChart
          title="Custody"
          data={custodyChartData}
          hideValues={hideBalances}
          maxItems={5}
        />

        {/* Exposure Breakdown */}
        <DonutChart
          title="Exposure"
          data={exposureChartData}
          hideValues={hideBalances}
          maxItems={8}
        />

        {/* Chain Breakdown */}
        <DonutChart
          title="By Chain"
          data={chainChartData}
          hideValues={hideBalances}
          maxItems={5}
        />
      </div>

      <hr className="border-[var(--border)]" />

      {/* Crypto Metrics Section */}
      {category === 'crypto' && (
        <>
          <div>
            <h3 className="text-[15px] font-medium mb-4">Crypto Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="STABLECOIN RATIO"
                value={`${cryptoMetrics.stablecoinRatio.toFixed(1)}%`}
              />
              <MetricCard
                label="BTC DOMINANCE"
                value={`${cryptoMetrics.btcDominance.toFixed(1)}%`}
                color="#F7931A"
              />
              <MetricCard
                label="ETH DOMINANCE"
                value={`${cryptoMetrics.ethDominance.toFixed(1)}%`}
                color="#627EEA"
              />
              <MetricCard
                label="DEFI EXPOSURE"
                value={`${cryptoMetrics.defiExposure.toFixed(1)}%`}
                color="#9C27B0"
              />
            </div>
          </div>

          {/* Crypto Allocation Section */}
          {cryptoAllocation.length > 0 && (
            <CryptoAllocationSection
              allocation={cryptoAllocation}
              hideBalances={hideBalances}
            />
          )}
        </>
      )}
    </div>
  );
}

// Metric Card Component - Flat design matching screenshot
function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        {color && <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />}
        <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

// Crypto Allocation Section Component - Flat design with horizontal bars
function CryptoAllocationSection({
  allocation,
  hideBalances,
}: {
  allocation: Array<{ category: string; label: string; value: number; percentage: number; color: string }>;
  hideBalances: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-medium">Crypto Allocation</h3>
        <Link href="/crypto/positions" className="text-[13px] text-[var(--foreground-muted)] flex items-center gap-1 hover:text-[var(--foreground)]">
          Details <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-4">
        {allocation.map((item) => (
          <div key={item.category} className="flex items-center gap-3">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[13px] font-medium w-24">{item.label}</span>
            <div className="flex-1 h-1.5 bg-[var(--background-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, item.percentage))}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
            <span className="text-[13px] text-[var(--foreground-muted)] w-16 text-right">
              {item.percentage.toFixed(1)}%
            </span>
            <span className="text-[13px] text-[var(--foreground-muted)] w-16 text-right">
              {hideBalances ? '••••' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
