'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronUp, ChevronDown, Edit2, Download, Coins, EyeOff, Eye } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, aggregatePositionsBySymbol, calculateCryptoBreakdown, getCategoryService, ExposureCategoryType, getAllExposureCategoryConfigs, getExposureCategoryConfig, filterDustPositions, DUST_THRESHOLD } from '@/services';
import CryptoIcon from '@/components/ui/CryptoIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import SearchInput from '@/components/ui/SearchInput';
import EmptyState from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
} from '@/lib/utils';
import { AssetWithPrice } from '@/types';

type SortField = 'symbol' | 'value' | 'amount' | 'change';
type SortDirection = 'asc' | 'desc';
type CategoryFilter = ExposureCategoryType | 'all';

export default function CryptoAssetsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryFilter>>(new Set(['all']));

  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, hideBalances, hideDust, toggleHideDust } = usePortfolioStore();
  const categoryService = getCategoryService();

  // Get exposure category options from service
  const filterOptions = useMemo(() => {
    const configs = getAllExposureCategoryConfigs();
    return Object.entries(configs).map(([key, config]) => ({
      value: key as ExposureCategoryType,
      label: config.label,
      color: config.color,
    }));
  }, []);

  // Calculate all positions with current prices
  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized service for crypto breakdown - SINGLE SOURCE OF TRUTH
  const breakdownData = useMemo(() => {
    return calculateCryptoBreakdown(allPositionsWithPrices);
  }, [allPositionsWithPrices]);

  // Filter by category, search, and dust
  const filteredPositions = useMemo(() => {
    let filtered = breakdownData.cryptoPositions;

    // Filter by category (multi-select - 'all' means show all)
    if (!selectedCategories.has('all')) {
      filtered = filtered.filter((p) => {
        const exposureCat = categoryService.getExposureCategory(p.symbol, p.type);
        return selectedCategories.has(exposureCat);
      });
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query)
      );
    }

    // Filter dust positions (keeps significant debt visible)
    filtered = filterDustPositions(filtered, hideDust);

    return filtered;
  }, [breakdownData.cryptoPositions, searchQuery, selectedCategories, categoryService, hideDust]);

  // Aggregate assets by symbol
  const aggregatedAssets = useMemo(() => {
    const assets = aggregatePositionsBySymbol(filteredPositions);
    assets.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'value':
          comparison = a.value - b.value;
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'change':
          comparison = a.changePercent24h - b.changePercent24h;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return assets;
  }, [filteredPositions, sortField, sortDirection]);

  // Category filter handlers (multi-select)
  const toggleCategory = (category: CategoryFilter) => {
    setSelectedCategories(prev => {
      const newFilters = new Set(prev);
      if (category === 'all') {
        return new Set(['all']);
      }
      newFilters.delete('all');
      if (newFilters.has(category)) {
        newFilters.delete(category);
        if (newFilters.size === 0) {
          return new Set(['all']);
        }
      } else {
        newFilters.add(category);
      }
      return newFilters;
    });
  };

  const clearFilters = () => {
    setSelectedCategories(new Set(['all']));
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  const openCustomPriceModal = (asset: AssetWithPrice) => {
    setCustomPriceModal({ isOpen: true, asset });
  };

  const closeCustomPriceModal = () => {
    setCustomPriceModal({ isOpen: false, asset: null });
  };

  const exportCSV = () => {
    const headers = ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', '24h Change', 'Allocation'];
    const rows = aggregatedAssets.map((a) => [
      a.symbol.toUpperCase(),
      a.name,
      a.type,
      a.amount,
      a.currentPrice,
      a.value,
      a.changePercent24h,
      a.allocation,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crypto-assets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const hasActiveFilter = !selectedCategories.has('all');
  const filteredValue = filteredPositions.reduce((sum, p) => sum + p.value, 0);

  // Empty state
  if (breakdownData.cryptoPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Coins className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No crypto positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add crypto positions or connect a wallet to track your holdings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header Stats */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL CRYPTO</p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(hasActiveFilter ? filteredValue : breakdownData.total)}
          </h2>
          {hasActiveFilter && (
            <p className="text-[13px] text-[var(--foreground-muted)]">
              of {formatCurrency(breakdownData.total)} total
            </p>
          )}
        </div>

      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Filter Chips - Multi-select by category */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => toggleCategory('all')}
          className={`px-3 py-1.5 text-[12px] font-medium transition-all ${
            selectedCategories.has('all')
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--background-secondary)] text-[var(--foreground)] hover:bg-[var(--background-tertiary)]'
          }`}
        >
          All
        </button>
        {filterOptions.map((opt) => {
          const isSelected = selectedCategories.has(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleCategory(opt.value)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--background-secondary)] text-[var(--foreground)] hover:bg-[var(--background-tertiary)]'
              }`}
            >
              <span
                className="w-2 h-2"
                style={{ backgroundColor: isSelected ? 'white' : opt.color }}
              />
              {opt.label}
            </button>
          );
        })}
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="px-2 py-1 text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1" />

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
        />

        {/* Hide Dust Toggle */}
        <button
          onClick={toggleHideDust}
          className={`btn p-2 flex items-center gap-1.5 ${hideDust ? 'btn-primary' : 'btn-secondary'}`}
          title={hideDust ? `Showing positions ≥$${DUST_THRESHOLD}` : 'Hide dust positions'}
        >
          {hideDust ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="text-xs">Dust</span>
        </button>

        {/* Export */}
        <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {aggregatedAssets.length === 0 ? (
        <EmptyState
          icon={<Coins className="w-full h-full" />}
          title="No assets found"
          description="No assets match your filters."
          size="sm"
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <button onClick={() => toggleSort('symbol')} className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                    Asset {renderSortIcon('symbol')}
                  </button>
                </th>
                <th className="table-header text-left pb-3">Category</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Amount {renderSortIcon('amount')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Value {renderSortIcon('value')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('change')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    24h {renderSortIcon('change')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedAssets.map((asset, index) => (
                <tr
                  key={`${asset.symbol}-${index}`}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-2">
                    <Link
                      href={`/assets/${asset.symbol.toLowerCase()}`}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <CryptoIcon symbol={asset.symbol} size={24} logoUrl={asset.logo} />
                      <p className="font-medium text-sm hover:text-[var(--accent-primary)] transition-colors">{asset.symbol.toUpperCase()}</p>
                    </Link>
                  </td>
                  <td className="py-2">
                    {(() => {
                      const exposureCat = categoryService.getExposureCategory(asset.symbol, asset.type);
                      const config = getExposureCategoryConfig(exposureCat);
                      return (
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-medium inline-flex items-center gap-1"
                          style={{
                            backgroundColor: `${config.color}1A`,
                            color: config.color,
                          }}
                        >
                          <span className="w-1.5 h-1.5" style={{ backgroundColor: config.color }} />
                          {config.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {hideBalances ? '•••' : formatNumber(asset.amount)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => openCustomPriceModal(asset)}
                      className="group inline-flex items-center gap-1 font-mono text-xs hover:text-[var(--accent-primary)] transition-colors"
                    >
                      {formatCurrency(asset.currentPrice)}
                      {asset.hasCustomPrice && (
                        <span className="w-1.5 h-1.5 bg-[var(--accent-primary)]" />
                      )}
                      <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </button>
                  </td>
                  <td className="py-2 text-right font-semibold text-sm">
                    {hideBalances ? '••••' : formatCurrency(asset.value)}
                  </td>
                  <td className={`py-2 text-right text-xs ${getChangeColor(asset.changePercent24h)}`}>
                    {formatPercent(asset.changePercent24h)}
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                    {asset.allocation.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
