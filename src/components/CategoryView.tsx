'use client';

import { useMemo, useState } from 'react';
import { Edit2, Trash2, ArrowUpDown } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculateExposureData, getCategoryService } from '@/services';
import { MainCategory } from '@/services/domain/category-service';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import { formatCurrency, formatPercent, formatNumber, getChangeColor } from '@/lib/utils';
import { AssetWithPrice } from '@/types';

interface CategoryViewProps {
  category: MainCategory;
  title: string;
  description: string;
  emptyIcon: React.ReactNode;
  emptyMessage: string;
}

type SortField = 'value' | 'amount' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';

export default function CategoryView({
  category,
  title,
  description,
  emptyIcon,
  emptyMessage,
}: CategoryViewProps) {
  const { positions, prices, customPrices, removePosition, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

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

  // Get exposure data for this category
  const exposureData = useMemo(() => {
    return calculateExposureData(categoryPositions);
  }, [categoryPositions]);

  // Get subcategories breakdown
  const subcategoryBreakdown = useMemo(() => {
    const catData = exposureData.categories.find((c) => c.category === category);
    return catData?.subCategories || [];
  }, [exposureData, category]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...categoryPositions].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'value':
          comparison = Math.abs(b.value) - Math.abs(a.value);
          break;
        case 'amount':
          comparison = b.amount - a.amount;
          break;
        case 'price':
          comparison = b.currentPrice - a.currentPrice;
          break;
        case 'change':
          comparison = b.changePercent24h - a.changePercent24h;
          break;
      }
      return sortDirection === 'asc' ? -comparison : comparison;
    });
  }, [categoryPositions, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const openCustomPriceModal = (asset: AssetWithPrice) => {
    setCustomPriceModal({ isOpen: true, asset });
  };

  const closeCustomPriceModal = () => {
    setCustomPriceModal({ isOpen: false, asset: null });
  };

  // Calculate totals
  const totalValue = categoryPositions.reduce((sum, p) => sum + p.value, 0);
  const totalGrossAssets = categoryPositions.filter(p => p.value > 0).reduce((sum, p) => sum + p.value, 0);
  const totalDebts = categoryPositions.filter(p => p.value < 0).reduce((sum, p) => sum + Math.abs(p.value), 0);

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
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="card-glow">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="stat-label mb-2">{title}</p>
            <h2 className="stat-value-lg">
              {hideBalances ? '••••••••' : formatCurrency(totalValue)}
            </h2>
            <p className="text-[var(--foreground-muted)] text-sm mt-2">
              {description}
            </p>
          </div>

          <div className="flex gap-4">
            <div className="text-right">
              <p className="stat-label mb-1">Assets</p>
              <p className="text-lg font-semibold">
                {hideBalances ? '••••' : formatCurrency(totalGrossAssets)}
              </p>
            </div>
            {totalDebts > 0 && (
              <div className="text-right">
                <p className="stat-label mb-1">Debts</p>
                <p className="text-lg font-semibold text-[var(--negative)]">
                  -{hideBalances ? '••••' : formatCurrency(totalDebts)}
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="stat-label mb-1">Positions</p>
              <p className="text-lg font-semibold">{categoryPositions.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subcategory Breakdown */}
      {subcategoryBreakdown.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {subcategoryBreakdown.map((sub) => (
            <div key={sub.category} className="metric-card">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: sub.color }}
                />
                <p className="stat-label">{sub.label}</p>
              </div>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(sub.value)}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {sub.percentage.toFixed(1)}% of {title.toLowerCase()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Positions Table */}
      <div className="card">
        <h3 className="font-semibold mb-6">All Positions</h3>

        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-left pb-3">Source</th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => toggleSort('amount')}
                    className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  >
                    Amount
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  >
                    Price
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => toggleSort('value')}
                    className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  >
                    Value
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => toggleSort('change')}
                    className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                  >
                    24h
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((position) => (
                <tr
                  key={position.id}
                  className="hover-row border-b border-[var(--border)] last:border-0"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--background-tertiary)] flex items-center justify-center text-sm font-bold">
                        {position.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{position.symbol.toUpperCase()}</p>
                          {position.isDebt && (
                            <span className="tag text-[var(--negative)] text-[10px]">DEBT</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className="tag text-xs">
                      {position.walletAddress ? 'Wallet' : position.protocol?.startsWith('cex:') ? 'CEX' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-4 text-right font-mono text-sm">
                    {hideBalances ? '•••' : formatNumber(position.amount)}
                  </td>
                  <td className="py-4 text-right">
                    <button
                      onClick={() => openCustomPriceModal(position)}
                      className="group inline-flex items-center gap-1 font-mono text-sm hover:text-[var(--accent-primary)] transition-colors"
                    >
                      {formatCurrency(position.currentPrice)}
                      {position.hasCustomPrice && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                      )}
                      <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  </td>
                  <td className={`py-4 text-right font-mono font-medium ${position.value < 0 ? 'text-[var(--negative)]' : ''}`}>
                    {hideBalances ? '••••' : formatCurrency(position.value)}
                  </td>
                  <td className={`py-4 text-right font-mono text-sm ${getChangeColor(position.changePercent24h)}`}>
                    {formatPercent(position.changePercent24h)}
                  </td>
                  <td className="py-4 text-right">
                    {!position.walletAddress && !position.protocol?.startsWith('cex:') && (
                      <button
                        onClick={() => removePosition(position.id)}
                        className="btn-ghost p-2 text-[var(--negative)] hover:bg-[var(--negative-light)]"
                        title="Delete position"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Price Modal */}
      {customPriceModal.asset && (
        <CustomPriceModal
          isOpen={customPriceModal.isOpen}
          onClose={closeCustomPriceModal}
          symbol={customPriceModal.asset.symbol}
          name={customPriceModal.asset.name}
          currentMarketPrice={
            customPriceModal.asset.hasCustomPrice
              ? prices[customPriceModal.asset.symbol.toLowerCase()]?.price || 0
              : customPriceModal.asset.currentPrice
          }
          currentCustomPrice={customPrices[customPriceModal.asset.symbol.toLowerCase()]?.price}
          currentNote={customPrices[customPriceModal.asset.symbol.toLowerCase()]?.note}
        />
      )}
    </div>
  );
}
