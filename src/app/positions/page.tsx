'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Search, Wallet, RefreshCw, Eye, EyeOff, ArrowUpDown, Download, Layers, Grid3X3, Edit2 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculatePortfolioSummary, aggregatePositionsBySymbol, calculateUnrealizedPnL } from '@/services';
import AddPositionModal from '@/components/modals/AddPositionModal';
import CryptoIcon from '@/components/ui/CryptoIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import { useRefresh } from '@/components/PortfolioProvider';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
  getAssetTypeLabel,
  formatAddress,
} from '@/lib/utils';
import { MainCategory, getCategoryLabel, isPerpProtocol, getCategoryService, AssetCategory, getPerpProtocolsWithPositions } from '@/services';
import { AssetWithPrice } from '@/types';

type ViewMode = 'positions' | 'assets';
type CategoryFilter = MainCategory | AssetCategory | 'all';
type SortField = 'symbol' | 'value' | 'amount' | 'change';
type SortDirection = 'asc' | 'desc';

// Category hierarchy for the dropdown
interface CategoryOption {
  value: CategoryFilter;
  label: string;
  isSubcategory?: boolean;
  parent?: MainCategory;
  color?: string;
}

export default function PositionsPage() {
  const searchParams = useSearchParams();
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('positions');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Custom price modal state
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, removePosition, wallets, hideBalances, toggleHideBalances } = usePortfolioStore();
  const { refresh, isRefreshing } = useRefresh();

  // Build category options hierarchy
  const categoryOptions = useMemo((): CategoryOption[] => {
    const categoryService = getCategoryService();
    const options: CategoryOption[] = [
      { value: 'all', label: 'All Categories' }
    ];

    // Add main categories with their subcategories
    categoryService.getMainCategories().forEach((mainCat) => {
      options.push({
        value: mainCat,
        label: categoryService.getMainCategoryLabel(mainCat),
        color: categoryService.getCategoryColor(mainCat as AssetCategory)
      });

      // Add subcategories
      categoryService.getSubCategories(mainCat).forEach((subCat) => {
        const catKey = `${mainCat}_${subCat}` as AssetCategory;
        options.push({
          value: catKey,
          label: getCategoryLabel(catKey),
          isSubcategory: true,
          parent: mainCat,
          color: categoryService.getCategoryColor(catKey)
        });
      });
    });

    return options;
  }, []);

  // Read category filter from URL params
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      const validOption = categoryOptions.find(o => o.value === categoryParam);
      if (validOption) {
        setCategoryFilter(categoryParam as CategoryFilter);
      }
    }
  }, [searchParams, categoryOptions]);

  // Calculate all positions with current prices (including custom price overrides)
  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Get portfolio summary from centralized service
  const portfolioSummary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  const totalNAV = portfolioSummary.totalValue;
  const totalChange24h = portfolioSummary.change24h;
  const totalChangePercent = portfolioSummary.changePercent24h;

  // Filter positions
  const filteredPositions = useMemo(() => {
    let filtered = allPositionsWithPrices;

    // Apply category filter
    if (categoryFilter !== 'all') {
      const categoryService = getCategoryService();
      const perpProtocolsWithPositions = getPerpProtocolsWithPositions(allPositionsWithPrices);

      filtered = filtered.filter((p) => {
        const mainCat = categoryService.getMainCategory(p.symbol, p.type);
        const subCat = categoryService.getSubCategory(p.symbol, p.type);
        const isOnPerpProtocol = p.protocol && isPerpProtocol(p.protocol);

        // Handle perp protocol positions specially
        if (isOnPerpProtocol) {
          const hasActivePositions = perpProtocolsWithPositions.has(p.protocol!.toLowerCase());

          if (categoryFilter === 'crypto_perps') {
            if (subCat === 'stablecoins') {
              return hasActivePositions;
            }
            return true;
          }

          if (categoryFilter === 'crypto') {
            return true;
          }

          if (categoryFilter === 'crypto_stablecoins' && subCat === 'stablecoins' && !hasActivePositions) {
            return true;
          }

          return false;
        }

        // Non-perp positions
        return categoryService.isAssetInCategory(p.symbol, categoryFilter as AssetCategory, p.type);
      });
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
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

    return filtered;
  }, [allPositionsWithPrices, categoryFilter, searchQuery, sortField, sortDirection]);

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

  const totalPositionCount = portfolioSummary.positionCount;
  const uniqueAssetCount = portfolioSummary.assetCount;

  const handleDelete = (id: string, isWalletPosition: boolean) => {
    if (isWalletPosition) {
      alert('Wallet positions are automatically synced. Remove the wallet from Accounts to remove these positions.');
      return;
    }
    if (confirm('Are you sure you want to remove this position?')) {
      removePosition(id);
    }
  };

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

  const exportCSV = () => {
    const data = viewMode === 'assets' ? aggregatedAssets : filteredPositions;
    const headers = viewMode === 'assets'
      ? ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', 'Cost Basis', 'Unrealized PnL', 'PnL %', '24h Change', 'Allocation']
      : ['Symbol', 'Name', 'Type', 'Source', 'Chain', 'Amount', 'Price', 'Value', 'Cost Basis', 'Unrealized PnL', 'PnL %', '24h Change', 'Allocation'];

    const rows = data.map((a) => {
      const pnl = a.costBasis ? a.value - a.costBasis : '';
      const pnlPercent = a.costBasis ? ((a.value - a.costBasis) / a.costBasis * 100).toFixed(2) : '';
      return viewMode === 'assets'
        ? [a.symbol.toUpperCase(), a.name, a.type, a.amount, a.currentPrice, a.value, a.costBasis || '', pnl, pnlPercent, a.changePercent24h, a.allocation]
        : [a.symbol.toUpperCase(), a.name, a.type, a.walletAddress || 'Manual', a.chain || '', a.amount, a.currentPrice, a.value, a.costBasis || '', pnl, pnlPercent, a.changePercent24h, a.allocation];
    });

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${viewMode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const displayData = viewMode === 'assets' ? aggregatedAssets : filteredPositions;

  const filteredTotal = useMemo(() => {
    return filteredPositions.reduce((sum, p) => sum + p.value, 0);
  }, [filteredPositions]);

  return (
    <div>
      {/* NAV Summary */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET ASSET VALUE</p>
          <h2 className="text-2xl font-semibold mb-1">{hideBalances ? '••••••••' : formatCurrency(totalNAV)}</h2>
          <div className="flex items-center gap-2">
            <span className={getChangeColor(totalChangePercent)}>
              {formatPercent(totalChangePercent)}
            </span>
            <span className="text-[13px] text-[var(--foreground-muted)]">
              ({hideBalances ? '••••' : formatCurrency(Math.abs(totalChange24h))}) 24h
            </span>
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Positions</p>
            <p className="text-[13px] font-medium">{totalPositionCount}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Assets</p>
            <p className="text-[13px] font-medium">{uniqueAssetCount}</p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Quick Category Selectors */}
      <div className="flex flex-wrap gap-2 mb-3">
        {categoryOptions
          .filter(opt => !opt.isSubcategory)
          .map((opt) => {
            // Check if this main category or any of its subcategories is selected
            const isMainSelected = categoryFilter === opt.value;
            const isSubcategorySelected = categoryOptions.some(
              sub => sub.parent === opt.value && categoryFilter === sub.value
            );
            const isActive = isMainSelected || isSubcategorySelected;

            return (
              <button
                key={opt.value}
                onClick={() => setCategoryFilter(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                    : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--foreground-muted)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {opt.color && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isActive ? 'white' : opt.color }}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
      </div>

      {/* Subcategory Quick Selectors - show when a main category is selected */}
      {(() => {
        // Find the current main category (either directly selected or parent of selected subcategory)
        const selectedOption = categoryOptions.find(opt => opt.value === categoryFilter);
        const currentMainCategory = selectedOption?.isSubcategory
          ? selectedOption.parent
          : (selectedOption?.value !== 'all' ? selectedOption?.value : null);

        if (!currentMainCategory) return null;

        const subcategories = categoryOptions.filter(opt => opt.parent === currentMainCategory);
        if (subcategories.length === 0) return null;

        return (
          <div className="flex flex-wrap items-center gap-2 mb-3 pl-2 border-l-2 border-[var(--accent-primary)]">
            <span className="text-xs text-[var(--foreground-muted)] mr-1">Subcategory:</span>
            {subcategories.map((sub) => (
              <button
                key={sub.value}
                onClick={() => setCategoryFilter(sub.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex items-center gap-1 ${
                  categoryFilter === sub.value
                    ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                    : 'bg-[var(--background-secondary)] border-[var(--border)] hover:border-[var(--foreground-muted)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {sub.color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: categoryFilter === sub.value ? 'white' : sub.color }}
                  />
                )}
                {sub.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Unified Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* View Mode Toggle */}
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)] rounded-lg">
            <button
              onClick={() => setViewMode('positions')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'positions'
                  ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Positions
            </button>
            <button
              onClick={() => setViewMode('assets')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'assets'
                  ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              Assets
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full text-sm py-2"
            />
          </div>

          {/* Actions */}
          <button
            onClick={toggleHideBalances}
            className="btn btn-secondary p-2"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowAddPosition(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>

      {/* Table */}
      <div>
        {displayData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--foreground-muted)]">
              {positions.length === 0
                ? 'No positions yet. Add a position or connect a wallet to get started.'
                : 'No positions match your filter.'}
            </p>
            {positions.length === 0 && (
              <div className="flex justify-center gap-3 mt-4">
                <button onClick={() => setShowAddPosition(true)} className="btn btn-primary">
                  <Plus className="w-4 h-4" /> Add Position
                </button>
                <button onClick={refresh} className="btn btn-secondary" disabled={isRefreshing}>
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Sync Wallets
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'positions' ? (
          <div className="table-scroll">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="table-header text-left pb-3 cursor-pointer" onClick={() => toggleSort('symbol')}>
                    <span className="flex items-center gap-1">
                      Asset
                      {sortField === 'symbol' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-left pb-3">Source</th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('amount')}>
                    <span className="flex items-center justify-end gap-1">
                      Amount
                      {sortField === 'amount' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-right pb-3">Price</th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('value')}>
                    <span className="flex items-center justify-end gap-1">
                      Value
                      {sortField === 'value' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-right pb-3">P&L</th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('change')}>
                    <span className="flex items-center justify-end gap-1">
                      24h
                      {sortField === 'change' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-right pb-3">%</th>
                  <th className="table-header text-right pb-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((position) => {
                  const isWalletPosition = !!position.walletAddress;
                  const isDebt = position.isDebt;

                  return (
                    <tr
                      key={position.id}
                      className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                        isDebt ? 'bg-[var(--negative-light)]' : ''
                      }`}
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <CryptoIcon symbol={position.symbol} size={32} isDebt={isDebt} />
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{position.symbol.toUpperCase()}</p>
                            {isDebt && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--negative)] text-white rounded">
                                DEBT
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        {isWalletPosition ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span className="text-xs text-[var(--foreground-muted)]">
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
                        ) : (
                          <span className="tag">{getAssetTypeLabel(position.type)}</span>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono text-sm">
                        {hideBalances ? '***' : formatNumber(position.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => openCustomPriceModal(position)}
                          className="group inline-flex items-center gap-1 font-mono text-sm hover:text-[var(--accent-primary)] transition-colors"
                          title="Click to set custom price"
                        >
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                          {position.hasCustomPrice && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" title="Custom price" />
                          )}
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </td>
                      <td className={`py-3 text-right font-semibold ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                        {hideBalances ? '****' : position.value !== 0 ? formatCurrency(position.value) : '-'}
                      </td>
                      <td className="py-3 text-right">
                        {(() => {
                          if (hideBalances || !position.costBasis) return <span className="text-[var(--foreground-muted)]">--</span>;
                          const pnlData = calculateUnrealizedPnL(position.value, position.costBasis, position.purchaseDate);
                          return (
                            <div className="group relative">
                              <span className={getChangeColor(pnlData.pnl)}>
                                {pnlData.pnl >= 0 ? '+' : ''}{formatCurrency(pnlData.pnl)}
                              </span>
                              <span className={`text-xs ml-1 ${getChangeColor(pnlData.pnlPercent)}`}>
                                ({pnlData.pnlPercent >= 0 ? '+' : ''}{pnlData.pnlPercent.toFixed(1)}%)
                              </span>
                              {pnlData.holdingDays > 0 && pnlData.annualizedReturn !== 0 && (
                                <div className="tooltip whitespace-nowrap">
                                  <div>Cost basis: {formatCurrency(position.costBasis)}</div>
                                  <div>Holding: {pnlData.holdingDays} days</div>
                                  <div>Annualized: {pnlData.annualizedReturn >= 0 ? '+' : ''}{pnlData.annualizedReturn.toFixed(1)}%</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`py-3 text-right ${getChangeColor(position.changePercent24h)}`}>
                        {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                      </td>
                      <td className={`py-3 text-right ${isDebt ? 'text-[var(--negative)]' : 'text-[var(--foreground-muted)]'}`}>
                        {position.allocation.toFixed(1)}%
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDelete(position.id, isWalletPosition)}
                          className={`p-2 rounded-lg transition-colors ${
                            isWalletPosition
                              ? 'text-[var(--foreground-muted)] cursor-not-allowed opacity-50'
                              : 'hover:bg-[var(--negative-light)] text-[var(--negative)]'
                          }`}
                          disabled={isWalletPosition}
                          title={isWalletPosition ? 'Remove wallet to delete these positions' : 'Delete position'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                  <th className="table-header text-left pb-3 cursor-pointer" onClick={() => toggleSort('symbol')}>
                    <span className="flex items-center gap-1">
                      Asset
                      {sortField === 'symbol' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-left pb-3">Type</th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('amount')}>
                    <span className="flex items-center justify-end gap-1">
                      Amount
                      {sortField === 'amount' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-right pb-3">Price</th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('value')}>
                    <span className="flex items-center justify-end gap-1">
                      Value
                      {sortField === 'value' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                  <th className="table-header text-right pb-3 cursor-pointer" onClick={() => toggleSort('change')}>
                    <span className="flex items-center justify-end gap-1">
                      24h
                      {sortField === 'change' && <ArrowUpDown className="w-3 h-3" />}
                    </span>
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
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <CryptoIcon symbol={asset.symbol} size={32} />
                        <p className="font-medium">{asset.symbol.toUpperCase()}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="text-sm text-[var(--foreground-muted)]">
                        {getAssetTypeLabel(asset.type)}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-sm">
                      {hideBalances ? '***' : formatNumber(asset.amount)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openCustomPriceModal(asset)}
                        className="group inline-flex items-center gap-1 font-mono text-sm hover:text-[var(--accent-primary)] transition-colors"
                        title="Click to set custom price"
                      >
                        {formatCurrency(asset.currentPrice)}
                        {asset.hasCustomPrice && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" title="Custom price" />
                        )}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </button>
                    </td>
                    <td className="py-3 text-right font-semibold">
                      {hideBalances ? '****' : formatCurrency(asset.value)}
                    </td>
                    <td className={`py-3 text-right ${getChangeColor(asset.changePercent24h)}`}>
                      {formatPercent(asset.changePercent24h)}
                    </td>
                    <td className="py-3 text-right text-[var(--foreground-muted)]">
                      {asset.allocation.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className="mt-4 flex items-center justify-between text-sm text-[var(--foreground-muted)]">
        <span>
          {displayData.length} {viewMode === 'assets' ? 'assets' : 'positions'}
          {wallets.length > 0 && ` | ${wallets.length} wallet${wallets.length > 1 ? 's' : ''}`}
        </span>
        <span>
          {categoryFilter !== 'all' || searchQuery ? (
            <>
              Filtered: <span className="font-semibold text-[var(--foreground)]">{hideBalances ? '******' : formatCurrency(filteredTotal)}</span>
              <span className="text-[var(--foreground-muted)]"> of {hideBalances ? '******' : formatCurrency(totalNAV)}</span>
            </>
          ) : (
            <>Total: <span className="font-semibold text-[var(--foreground)]">{hideBalances ? '******' : formatCurrency(totalNAV)}</span></>
          )}
        </span>
      </div>

      <AddPositionModal
        isOpen={showAddPosition}
        onClose={() => setShowAddPosition(false)}
      />

      {customPriceModal.asset && (
        <CustomPriceModal
          isOpen={customPriceModal.isOpen}
          onClose={closeCustomPriceModal}
          symbol={customPriceModal.asset.symbol}
          name={customPriceModal.asset.name}
          currentMarketPrice={
            // Get market price (not custom) for reference
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
