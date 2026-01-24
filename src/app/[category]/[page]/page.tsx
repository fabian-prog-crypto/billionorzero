'use client';

import { useParams, notFound } from 'next/navigation';
import { useMemo } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, aggregatePositionsBySymbol, calculatePortfolioSummary } from '@/services';
import Header from '@/components/Header';
import { useRefresh } from '@/components/PortfolioProvider';
import { formatCurrency, formatPercent, getChangeColor } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

// Valid categories and pages
const validCategories = ['crypto', 'stocks', 'cash', 'other'] as const;
const validPages = ['positions', 'exposure', 'perps', 'performance', 'wallets', 'accounts', 'settings'] as const;

type Category = typeof validCategories[number];
type PageType = typeof validPages[number];

// Asset type mapping for filtering
const categoryAssetTypes: Record<Category, string[]> = {
  crypto: ['crypto'],
  stocks: ['stock'],
  cash: ['cash', 'stablecoin'],
  other: ['other', 'nft', 'collectible'],
};

export default function CategoryPage() {
  const params = useParams();
  const category = params.category as string;
  const page = params.page as string;

  // Validate params
  if (!validCategories.includes(category as Category)) {
    notFound();
  }
  if (!validPages.includes(page as PageType)) {
    notFound();
  }

  const typedCategory = category as Category;
  const typedPage = page as PageType;

  // Render the appropriate page component
  switch (typedPage) {
    case 'positions':
      return <CategoryPositions category={typedCategory} />;
    case 'exposure':
      return <CategoryExposure category={typedCategory} />;
    case 'perps':
      return <CategoryPerps category={typedCategory} />;
    default:
      return <ComingSoon category={typedCategory} page={typedPage} />;
  }
}

// Category-filtered Positions Page
function CategoryPositions({ category }: { category: Category }) {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const { refresh } = useRefresh();

  const filteredPositions = useMemo(() => {
    const assetTypes = categoryAssetTypes[category];
    return positions.filter(p => {
      // Filter by asset type
      const type = p.type || 'crypto';
      return assetTypes.includes(type);
    });
  }, [positions, category]);

  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(filteredPositions, prices, customPrices);
  }, [filteredPositions, prices, customPrices]);

  const summary = useMemo(() => {
    return calculatePortfolioSummary(filteredPositions, prices, customPrices);
  }, [filteredPositions, prices, customPrices]);

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <div>
      <Header title={`${categoryLabel} Positions`} onSync={refresh} />

      {/* Summary */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label mb-1">Total Value</p>
            <p className="stat-value">
              {hideBalances ? '••••••••' : formatCurrency(summary.totalValue)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {summary.changePercent24h >= 0 ? (
              <TrendingUp className="w-5 h-5 text-[var(--positive)]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-[var(--negative)]" />
            )}
            <span className={getChangeColor(summary.changePercent24h) + ' font-semibold'}>
              {formatPercent(summary.changePercent24h)}
            </span>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="card">
        <h3 className="font-semibold mb-4">{allAssetsWithPrices.length} Positions</h3>
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Amount</th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">24h</th>
              </tr>
            </thead>
            <tbody>
              {allAssetsWithPrices.map((asset, idx) => (
                <tr key={`${asset.symbol}-${idx}`} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-[var(--tag-bg)] rounded-lg flex items-center justify-center text-sm font-bold">
                        {asset.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{asset.symbol.toUpperCase()}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{asset.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {hideBalances ? '•••' : asset.amount.toLocaleString()}
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {formatCurrency(asset.currentPrice)}
                  </td>
                  <td className="py-3 text-right font-mono font-medium">
                    {hideBalances ? '••••' : formatCurrency(asset.value)}
                  </td>
                  <td className={`py-3 text-right font-mono text-sm ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allAssetsWithPrices.length === 0 && (
          <div className="text-center py-12 text-[var(--foreground-muted)]">
            No {category} positions found
          </div>
        )}
      </div>
    </div>
  );
}

// Category-filtered Exposure Page
function CategoryExposure({ category }: { category: Category }) {
  const { positions, prices, customPrices } = usePortfolioStore();
  const { refresh } = useRefresh();

  const filteredPositions = useMemo(() => {
    const assetTypes = categoryAssetTypes[category];
    return positions.filter(p => {
      const type = p.type || 'crypto';
      return assetTypes.includes(type);
    });
  }, [positions, category]);

  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(filteredPositions, prices, customPrices);
  }, [filteredPositions, prices, customPrices]);

  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const exposureByAsset = useMemo(() => {
    return aggregatePositionsBySymbol(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const { exposureMetrics, concentrationMetrics } = exposureData;

  return (
    <div>
      <Header title={`${categoryLabel} Exposure`} onSync={refresh} />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Gross Exposure</p>
          <p className="text-xl font-semibold">{formatCurrency(exposureMetrics.grossExposure)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Net Exposure</p>
          <p className="text-xl font-semibold">{formatCurrency(exposureMetrics.netExposure)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Long</p>
          <p className="text-xl font-semibold text-[var(--positive)]">{formatCurrency(exposureMetrics.longExposure)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Short</p>
          <p className="text-xl font-semibold text-[var(--negative)]">{formatCurrency(exposureMetrics.shortExposure)}</p>
        </div>
      </div>

      {/* Concentration */}
      <div className="card mb-6">
        <h3 className="font-semibold mb-4">Concentration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Top Position</p>
            <p className="text-lg font-semibold">{concentrationMetrics.top1Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Top 5</p>
            <p className="text-lg font-semibold">{concentrationMetrics.top5Percentage.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Positions</p>
            <p className="text-lg font-semibold">{concentrationMetrics.positionCount}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Unique Assets</p>
            <p className="text-lg font-semibold">{concentrationMetrics.assetCount}</p>
          </div>
        </div>
      </div>

      {/* Asset Breakdown */}
      <div className="card">
        <h3 className="font-semibold mb-4">Exposure by Asset</h3>
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {exposureByAsset.map((asset) => (
                <tr key={asset.symbol} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3">
                    <span className="tag">{asset.symbol.toUpperCase()}</span>
                  </td>
                  <td className="py-3 text-right font-mono">
                    {formatCurrency(asset.value)}
                  </td>
                  <td className="py-3 text-right text-[var(--foreground-muted)]">
                    {asset.allocation.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {exposureByAsset.length === 0 && (
          <div className="text-center py-12 text-[var(--foreground-muted)]">
            No {category} exposure data
          </div>
        )}
      </div>
    </div>
  );
}

// Category-filtered Perps Page
function CategoryPerps({ category }: { category: Category }) {
  const { refresh } = useRefresh();
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  if (category !== 'crypto') {
    return (
      <div>
        <Header title={`${categoryLabel} Perps`} onSync={refresh} />
        <div className="card">
          <div className="text-center py-12 text-[var(--foreground-muted)]">
            Perpetual positions are only available for crypto
          </div>
        </div>
      </div>
    );
  }

  // For crypto, show perps - this would need the full perps logic
  return (
    <div>
      <Header title="Crypto Perps" onSync={refresh} />
      <div className="card">
        <div className="text-center py-12 text-[var(--foreground-muted)]">
          View perpetual positions on the main Perps page
        </div>
      </div>
    </div>
  );
}

// Coming Soon placeholder
function ComingSoon({ category, page }: { category: Category; page: PageType }) {
  const { refresh } = useRefresh();
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const pageLabel = page.charAt(0).toUpperCase() + page.slice(1);

  return (
    <div>
      <Header title={`${categoryLabel} ${pageLabel}`} onSync={refresh} />
      <div className="card">
        <div className="text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-2">Coming Soon</p>
          <p className="text-sm text-[var(--foreground-subtle)]">
            {categoryLabel}-specific {pageLabel.toLowerCase()} page is under development
          </p>
        </div>
      </div>
    </div>
  );
}
