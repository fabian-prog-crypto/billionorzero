'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Trash2, Wallet, ArrowUpDown, ChevronUp, ChevronDown, Layers, Grid3X3, Edit2, Download, Coins } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, aggregatePositionsBySymbol, calculateCryptoBreakdown, getCategoryService, ExposureCategoryType, getAllExposureCategoryConfigs, getExposureCategoryConfig } from '@/services';
import DonutChart from '@/components/charts/DonutChart';
import CryptoIcon from '@/components/ui/CryptoIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import SearchInput from '@/components/ui/SearchInput';
import ViewModeToggle from '@/components/ui/ViewModeToggle';
import EmptyState from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
  getAssetTypeLabel,
  formatAddress,
} from '@/lib/utils';
import { AssetWithPrice } from '@/types';

type ViewMode = 'positions' | 'assets';
type SortField = 'symbol' | 'value' | 'amount' | 'change';
type SortDirection = 'asc' | 'desc';
type CategoryFilter = ExposureCategoryType | 'all';

export default function CryptoPositionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('assets');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryFilter>>(new Set(['all']));

  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, removePosition, hideBalances } = usePortfolioStore();
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

  // Filter by category and search
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

    return filtered;
  }, [breakdownData.cryptoPositions, searchQuery, selectedCategories, categoryService]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
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
  }, [filteredPositions, sortField, sortDirection]);

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

  const SortIcon = ({ field }: { field: SortField }) => {
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

  const handleDelete = (id: string, isWalletPosition: boolean) => {
    if (isWalletPosition) {
      alert('Wallet positions are automatically synced. Remove the wallet to remove these positions.');
      return;
    }
    if (confirm('Are you sure you want to remove this position?')) {
      removePosition(id);
    }
  };

  const exportCSV = () => {
    const data = viewMode === 'assets' ? aggregatedAssets : sortedPositions;
    const headers = viewMode === 'assets'
      ? ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', '24h Change', 'Allocation']
      : ['Symbol', 'Name', 'Source', 'Chain', 'Amount', 'Price', 'Value', '24h Change', 'Allocation'];

    const rows = data.map((a) => {
      return viewMode === 'assets'
        ? [a.symbol.toUpperCase(), a.name, a.type, a.amount, a.currentPrice, a.value, a.changePercent24h, a.allocation]
        : [a.symbol.toUpperCase(), a.name, a.walletAddress || 'Manual', a.chain || '', a.amount, a.currentPrice, a.value, a.changePercent24h, a.allocation];
    });

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crypto-${viewMode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const displayData = viewMode === 'assets' ? aggregatedAssets : sortedPositions;
  const hasActiveFilter = !selectedCategories.has('all');
  // Only sum positive values (assets) to match pie chart calculation
  const filteredValue = filteredPositions.filter(p => p.value > 0).reduce((sum, p) => sum + p.value, 0);
  const uniqueAssets = new Set(breakdownData.cryptoPositions.map(p => p.symbol.toLowerCase())).size;

  // Empty state
  if (breakdownData.cryptoPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
            <Coins className="w-10 h-10 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No crypto positions</h2>
          <p className="text-[var(--foreground-muted)] text-center max-w-md">
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

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Positions</p>
            <p className="text-[13px] font-medium">{breakdownData.cryptoPositions.length}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Assets</p>
            <p className="text-[13px] font-medium">{uniqueAssets}</p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Pie Chart - Category Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <DonutChart
          title="By Category"
          data={breakdownData.chartData}
          hideValues={hideBalances}
          maxItems={6}
        />

        {/* Summary Stats */}
        <div className="md:col-span-2">
          <h3 className="text-[15px] font-medium mb-4">Breakdown</h3>
          <div className="grid grid-cols-3 gap-4">
            {breakdownData.chartData.slice(0, 6).map((item) => (
              <div key={item.label}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-[13px] font-medium">{item.label}</span>
                </div>
                <p className="text-lg font-semibold mb-0.5">
                  {hideBalances ? '••••' : formatCurrency(item.value)}
                </p>
                <p className="text-[12px] text-[var(--foreground-muted)]">
                  {breakdownData.total > 0 ? ((item.value / breakdownData.total) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Filter Chips - Multi-select by category */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => toggleCategory('all')}
          className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
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
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--background-secondary)] text-[var(--foreground)] hover:bg-[var(--background-tertiary)]'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
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
        {/* View Toggle */}
        <ViewModeToggle
          modes={[
            { id: 'assets', label: 'Assets', icon: <Grid3X3 className="w-3.5 h-3.5" />, count: aggregatedAssets.length },
            { id: 'positions', label: 'Positions', icon: <Layers className="w-3.5 h-3.5" />, count: sortedPositions.length },
          ]}
          activeMode={viewMode}
          onChange={(mode) => setViewMode(mode as ViewMode)}
        />

        <div className="flex-1" />

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
          className="flex-1 max-w-xs"
        />

        {/* Export */}
        <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {displayData.length === 0 ? (
        <EmptyState
          icon={<Coins className="w-full h-full" />}
          title="No positions found"
          description="No positions match your filters."
          size="sm"
        />
      ) : viewMode === 'positions' ? (
        <div className="table-scroll">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <button onClick={() => toggleSort('symbol')} className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                    Asset <SortIcon field="symbol" />
                  </button>
                </th>
                <th className="table-header text-left pb-3">Source</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Amount <SortIcon field="amount" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Value <SortIcon field="value" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('change')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    24h <SortIcon field="change" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">%</th>
                <th className="table-header text-right pb-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((position) => {
                const isWalletPosition = !!position.walletAddress;
                const isCexPosition = position.protocol?.startsWith('cex:');
                const isDebt = position.isDebt;

                return (
                  <tr
                    key={position.id}
                    className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                      isDebt ? 'bg-[var(--negative-light)]' : ''
                    }`}
                  >
                    <td className="py-2">
                      <Link
                        href={`/assets/${position.symbol.toLowerCase()}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <CryptoIcon symbol={position.symbol} size={24} isDebt={isDebt} logoUrl={position.logo} />
                        <div className="flex items-center gap-2">
                          <p className="font-medium hover:text-[var(--accent-primary)] transition-colors">{position.symbol.toUpperCase()}</p>
                          {isDebt && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--negative)] text-white rounded">
                              DEBT
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-2">
                      {isWalletPosition ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Wallet className="w-3 h-3 text-[var(--accent-primary)]" />
                          <span className="text-[11px] text-[var(--foreground-muted)]">
                            {formatAddress(position.walletAddress!, 4)}
                          </span>
                          {position.chain && (
                            <span className="tag text-[10px] py-0 px-1.5">{position.chain}</span>
                          )}
                          {position.protocol && (
                            <span className="tag text-[10px] py-0 px-1.5 bg-[var(--accent-primary)] text-white">
                              {position.protocol}
                            </span>
                          )}
                        </div>
                      ) : isCexPosition ? (
                        <span className="tag text-[11px]">CEX</span>
                      ) : (
                        <span className="tag text-[11px]">{getAssetTypeLabel(position.type)}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {hideBalances ? '•••' : formatNumber(position.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => openCustomPriceModal(position)}
                        className="group inline-flex items-center gap-1 font-mono text-xs hover:text-[var(--accent-primary)] transition-colors"
                      >
                        {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                        {position.hasCustomPrice && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                        )}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </button>
                    </td>
                    <td className={`py-2 text-right font-semibold text-sm ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                      {hideBalances ? '••••' : formatCurrency(position.value)}
                    </td>
                    <td className={`py-2 text-right text-xs ${getChangeColor(position.changePercent24h)}`}>
                      {formatPercent(position.changePercent24h)}
                    </td>
                    <td className={`py-2 text-right text-xs ${isDebt ? 'text-[var(--negative)]' : 'text-[var(--foreground-muted)]'}`}>
                      {position.allocation.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right">
                      {!isWalletPosition && !isCexPosition && (
                        <button
                          onClick={() => handleDelete(position.id, false)}
                          className="p-2 rounded-lg hover:bg-[var(--negative-light)] text-[var(--negative)] transition-colors"
                          title="Delete position"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <button onClick={() => toggleSort('symbol')} className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                    Asset <SortIcon field="symbol" />
                  </button>
                </th>
                <th className="table-header text-left pb-3">Category</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Amount <SortIcon field="amount" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Value <SortIcon field="value" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => toggleSort('change')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    24h <SortIcon field="change" />
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
                          className="px-1.5 py-0.5 text-[10px] font-medium rounded inline-flex items-center gap-1"
                          style={{
                            backgroundColor: `${config.color}1A`,
                            color: config.color,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
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
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
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
