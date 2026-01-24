'use client';

import { useState, useMemo } from 'react';
import { Trash2, Search, Wallet, ArrowUpDown, Download, Layers, Grid3X3, Edit2 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, aggregatePositionsBySymbol, getCategoryService } from '@/services';
import Header from '@/components/Header';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
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

export default function CryptoPositionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('positions');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, removePosition, hideBalances } = usePortfolioStore();
  const categoryService = getCategoryService();

  // Calculate all positions with current prices
  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter to crypto only
  const cryptoPositions = useMemo(() => {
    return allPositionsWithPrices.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      return mainCat === 'crypto';
    });
  }, [allPositionsWithPrices, categoryService]);

  // Filter by search
  const filteredPositions = useMemo(() => {
    if (!searchQuery) return cryptoPositions;
    const query = searchQuery.toLowerCase();
    return cryptoPositions.filter(
      (p) =>
        p.symbol.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query)
    );
  }, [cryptoPositions, searchQuery]);

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

  // Calculate totals
  const totalValue = cryptoPositions.reduce((sum, p) => sum + p.value, 0);
  const totalPositions = cryptoPositions.length;
  const uniqueAssets = new Set(cryptoPositions.map(p => p.symbol.toLowerCase())).size;

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

  return (
    <div>
      <Header title="Crypto Positions" />

      {/* Summary Card */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label mb-1">Total Crypto Value</p>
            <p className="stat-value">{hideBalances ? '••••••••' : formatCurrency(totalValue)}</p>
          </div>
          <div className="text-right text-sm text-[var(--foreground-muted)]">
            <p>{totalPositions} positions</p>
            <p>{uniqueAssets} assets</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-3">
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

          <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {displayData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--foreground-muted)]">
              {cryptoPositions.length === 0
                ? 'No crypto positions yet.'
                : 'No positions match your search.'}
            </p>
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
                        ) : isCexPosition ? (
                          <span className="tag">CEX</span>
                        ) : (
                          <span className="tag">{getAssetTypeLabel(position.type)}</span>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono text-sm">
                        {hideBalances ? '•••' : formatNumber(position.amount)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => openCustomPriceModal(position)}
                          className="group inline-flex items-center gap-1 font-mono text-sm hover:text-[var(--accent-primary)] transition-colors"
                        >
                          {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                          {position.hasCustomPrice && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                          )}
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </td>
                      <td className={`py-3 text-right font-semibold ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                        {hideBalances ? '••••' : formatCurrency(position.value)}
                      </td>
                      <td className={`py-3 text-right ${getChangeColor(position.changePercent24h)}`}>
                        {formatPercent(position.changePercent24h)}
                      </td>
                      <td className={`py-3 text-right ${isDebt ? 'text-[var(--negative)]' : 'text-[var(--foreground-muted)]'}`}>
                        {position.allocation.toFixed(1)}%
                      </td>
                      <td className="py-3 text-right">
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
                      {hideBalances ? '•••' : formatNumber(asset.amount)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openCustomPriceModal(asset)}
                        className="group inline-flex items-center gap-1 font-mono text-sm hover:text-[var(--accent-primary)] transition-colors"
                      >
                        {formatCurrency(asset.currentPrice)}
                        {asset.hasCustomPrice && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                        )}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </button>
                    </td>
                    <td className="py-3 text-right font-semibold">
                      {hideBalances ? '••••' : formatCurrency(asset.value)}
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
        </span>
        <span>
          Total: <span className="font-semibold text-[var(--foreground)]">{hideBalances ? '••••••••' : formatCurrency(totalValue)}</span>
        </span>
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
