'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Search, Wallet, RefreshCw, Eye, EyeOff, ArrowUpDown, Download, Layers, Grid3X3 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services';
import Header from '@/components/Header';
import AddPositionModal from '@/components/modals/AddPositionModal';
import { useRefresh } from '@/components/PortfolioProvider';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
  getAssetTypeLabel,
  formatAddress,
} from '@/lib/utils';
import { AssetCategory, getAssetCategory, getCategoryLabel } from '@/lib/assetCategories';
import { AssetWithPrice } from '@/types';

type ViewMode = 'positions' | 'assets';
type FilterType = 'all' | 'crypto' | 'stock' | 'cash' | 'manual';
type CategoryFilter = AssetCategory | null;
type SortField = 'symbol' | 'value' | 'amount' | 'change';
type SortDirection = 'asc' | 'desc';

export default function PositionsPage() {
  const searchParams = useSearchParams();
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('positions');
  const [filter, setFilter] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { positions, prices, removePosition, wallets, hideBalances, toggleHideBalances } = usePortfolioStore();
  const { refresh, isRefreshing } = useRefresh();

  // Read category filter from URL params
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam && ['stablecoins', 'btc', 'eth', 'sol', 'cash', 'stocks', 'other'].includes(categoryParam)) {
      setCategoryFilter(categoryParam as AssetCategory);
    }
  }, [searchParams]);

  // Calculate all positions with current prices
  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices);
  }, [positions, prices]);

  // Calculate total NAV
  const totalNAV = useMemo(() => {
    return allPositionsWithPrices.reduce((sum, p) => sum + p.value, 0);
  }, [allPositionsWithPrices]);

  // Calculate 24h change
  const totalChange24h = useMemo(() => {
    return allPositionsWithPrices.reduce((sum, p) => sum + p.change24h, 0);
  }, [allPositionsWithPrices]);

  const totalChangePercent = totalNAV > 0
    ? (totalChange24h / (totalNAV - totalChange24h)) * 100
    : 0;

  // Filter positions (for both views)
  const filteredPositions = useMemo(() => {
    let filtered = allPositionsWithPrices;

    // Apply type filter
    if (filter === 'manual') {
      filtered = filtered.filter((p) => !p.walletAddress && p.type !== 'cash');
    } else if (filter !== 'all') {
      // For crypto/stock/cash, show all positions of that type
      filtered = filtered.filter((p) => p.type === filter);
    }

    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter((p) => getAssetCategory(p.symbol, p.type) === categoryFilter);
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
  }, [allPositionsWithPrices, filter, categoryFilter, searchQuery, sortField, sortDirection]);

  // Aggregate assets by symbol (for assets view)
  const aggregatedAssets = useMemo(() => {
    const assetMap = new Map<string, AssetWithPrice>();

    filteredPositions.forEach((asset) => {
      const key = `${asset.symbol.toLowerCase()}-${asset.type}`;
      const existing = assetMap.get(key);

      if (existing) {
        const newAmount = existing.amount + asset.amount;
        const newValue = existing.value + asset.value;
        const newChange24h = existing.change24h + asset.change24h;
        assetMap.set(key, {
          ...existing,
          amount: newAmount,
          value: newValue,
          change24h: newChange24h,
          allocation: totalNAV > 0 ? (newValue / totalNAV) * 100 : 0,
        });
      } else {
        assetMap.set(key, { ...asset });
      }
    });

    const assets = Array.from(assetMap.values());

    // Sort aggregated assets
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
  }, [filteredPositions, totalNAV, sortField, sortDirection]);

  // Count positions by source
  const walletPositionsCount = positions.filter((p) => p.walletAddress).length;
  const manualPositionsCount = positions.filter((p) => !p.walletAddress).length;

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

  const exportCSV = () => {
    const data = viewMode === 'assets' ? aggregatedAssets : filteredPositions;
    const headers = viewMode === 'assets'
      ? ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', '24h Change', 'Allocation']
      : ['Symbol', 'Name', 'Type', 'Source', 'Chain', 'Amount', 'Price', 'Value', '24h Change', 'Allocation'];

    const rows = data.map((a) => viewMode === 'assets'
      ? [a.symbol.toUpperCase(), a.name, a.type, a.amount, a.currentPrice, a.value, a.changePercent24h, a.allocation]
      : [a.symbol.toUpperCase(), a.name, a.type, a.walletAddress || 'Manual', a.chain || '', a.amount, a.currentPrice, a.value, a.changePercent24h, a.allocation]
    );

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${viewMode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const displayData = viewMode === 'assets' ? aggregatedAssets : filteredPositions;

  // Calculate filtered total (for when filters are applied)
  const filteredTotal = useMemo(() => {
    return filteredPositions.reduce((sum, p) => sum + p.value, 0);
  }, [filteredPositions]);

  return (
    <div>
      <Header title="Portfolio" onSync={refresh} />

      {/* NAV Summary Card */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--foreground-muted)] mb-1">Total Net Asset Value (NAV)</p>
            <h2 className="text-3xl font-bold">{hideBalances ? '******' : formatCurrency(totalNAV)}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={getChangeColor(totalChangePercent)}>
                {formatPercent(totalChangePercent)}
              </span>
              <span className="text-sm text-[var(--foreground-muted)]">
                ({hideBalances ? '****' : formatCurrency(Math.abs(totalChange24h))}) 24h
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-[var(--foreground-muted)]">
            <p>{positions.length} positions total</p>
            <p>{aggregatedAssets.length} unique assets</p>
            <p>{walletPositionsCount} from wallets, {manualPositionsCount} manual</p>
          </div>
        </div>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)] rounded-lg">
            <button
              onClick={() => setViewMode('positions')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'positions'
                  ? 'bg-white text-[var(--foreground)] shadow-sm'
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
                  ? 'bg-white text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              Assets
            </button>
          </div>

          {/* Type filters */}
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)] rounded-lg">
            {(['all', 'crypto', 'stock', 'cash', 'manual'] as FilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filter === type
                    ? 'bg-white text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {type === 'all' ? 'All' : getAssetTypeLabel(type)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-48"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Hide balances toggle */}
          <button
            onClick={toggleHideBalances}
            className="btn btn-secondary"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Export */}
          <button onClick={exportCSV} className="btn btn-secondary">
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowAddPosition(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add Position
          </button>
        </div>
      </div>

      {/* Category quick filters */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-[var(--foreground-muted)]">Quick filters:</span>
        {(['stablecoins', 'btc', 'eth', 'sol', 'cash', 'stocks'] as AssetCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              categoryFilter === cat
                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                : 'border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]'
            }`}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter(null)}
            className="px-2 py-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
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
          /* Positions Table */
          <table className="w-full">
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
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isDebt ? 'bg-[var(--negative)] text-white' : 'bg-[var(--tag-bg)]'
                        }`}>
                          {position.symbol.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{position.symbol.toUpperCase()}</p>
                            {isDebt && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--negative)] text-white rounded">
                                DEBT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
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
                    <td className="py-3 text-right font-mono text-sm">
                      {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                    </td>
                    <td className={`py-3 text-right font-semibold ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                      {hideBalances ? '****' : position.value !== 0 ? formatCurrency(position.value) : '-'}
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
        ) : (
          /* Assets Table (aggregated) */
          <table className="w-full">
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
                    Total Amount
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
                <th className="table-header text-right pb-3">Allocation</th>
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
                      <div className="w-8 h-8 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                        {asset.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{asset.symbol.toUpperCase()}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{asset.name}</p>
                      </div>
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
                  <td className="py-3 text-right font-mono text-sm">
                    {formatCurrency(asset.currentPrice)}
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
        )}
      </div>

      {/* Summary footer */}
      <div className="mt-4 flex items-center justify-between text-sm text-[var(--foreground-muted)]">
        <span>
          Showing {displayData.length} {viewMode === 'assets' ? 'assets' : 'positions'}
          {wallets.length > 0 && ` | ${wallets.length} wallet${wallets.length > 1 ? 's' : ''} connected`}
        </span>
        <span>
          {(filter !== 'all' || categoryFilter) ? 'Filtered' : 'Total'}: <span className="font-semibold text-[var(--foreground)]">{hideBalances ? '******' : formatCurrency(filteredTotal)}</span>
          {(filter !== 'all' || categoryFilter) && (
            <span className="text-[var(--foreground-muted)]"> of {hideBalances ? '******' : formatCurrency(totalNAV)}</span>
          )}
        </span>
      </div>

      <AddPositionModal
        isOpen={showAddPosition}
        onClose={() => setShowAddPosition(false)}
      />
    </div>
  );
}
