'use client';

import { useState, useMemo } from 'react';
import { Edit2, Trash2, Download, TrendingUp, EyeOff, Eye } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateEquitiesBreakdown,
  getCategoryService,
  filterDustPositions,
  DUST_THRESHOLD,
} from '@/services';
import StockIcon from '@/components/ui/StockIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import SearchInput from '@/components/ui/SearchInput';
import SortableTableHeader from '@/components/ui/SortableTableHeader';
import EmptyState from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
} from '@/lib/utils';
import { SUBCATEGORY_COLORS } from '@/lib/colors';
import { AssetWithPrice, ParsedPositionAction } from '@/types';

type SortField = 'symbol' | 'value' | 'amount' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';
type TypeFilter = 'all' | 'stocks' | 'etfs';

export default function EquitiesPositionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });
  const [editAction, setEditAction] = useState<ParsedPositionAction | null>(null);

  const store = usePortfolioStore();
  const { positions, prices, customPrices, fxRates, hideBalances, hideDust, toggleHideDust, removePosition } = store;
  const categoryService = getCategoryService();

  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const breakdownData = useMemo(() => {
    return calculateEquitiesBreakdown(allPositionsWithPrices);
  }, [allPositionsWithPrices]);

  const filteredPositions = useMemo(() => {
    let filtered = breakdownData.equityPositions;

    // Filter by type
    if (typeFilter !== 'all') {
      filtered = filtered.filter((p) => {
        const subCat = categoryService.getSubCategory(p.symbol, p.type);
        return typeFilter === 'etfs' ? subCat === 'etfs' : subCat !== 'etfs';
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

    // Filter dust
    filtered = filterDustPositions(filtered, hideDust);

    return filtered;
  }, [breakdownData.equityPositions, searchQuery, typeFilter, categoryService, hideDust]);

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
        case 'price':
          comparison = a.currentPrice - b.currentPrice;
          break;
        case 'change':
          comparison = (a.changePercent24h || 0) - (b.changePercent24h || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredPositions, sortField, sortDirection]);

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

  const handleEdit = (pos: AssetWithPrice) => {
    setEditAction({
      action: 'update_position',
      symbol: pos.symbol,
      name: pos.name,
      assetType: pos.type,
      amount: pos.amount,
      costBasis: pos.costBasis,
      date: pos.purchaseDate,
      matchedPositionId: pos.id,
      confidence: 1,
      summary: `Edit ${pos.symbol.toUpperCase()} position`,
    });
  };

  const isManualPosition = (pos: AssetWithPrice): boolean => {
    if (!pos.accountId) return true;
    const account = store.accounts.find(a => a.id === pos.accountId);
    return !account || account.connection.dataSource === 'manual';
  };

  const handleDelete = (pos: AssetWithPrice) => {
    if (!confirm(`Delete ${pos.symbol.toUpperCase()} position?`)) return;
    removePosition(pos.id);
  };

  const exportCSV = () => {
    const headers = ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', '24h Change', 'Allocation'];
    const rows = sortedPositions.map((p) => {
      const subCat = categoryService.getSubCategory(p.symbol, p.type);
      return [
        p.symbol.toUpperCase(),
        p.name,
        subCat === 'etfs' ? 'ETF' : 'Stock',
        p.amount,
        p.currentPrice,
        p.value,
        p.changePercent24h,
        p.allocation,
      ];
    });
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equities-positions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilter = typeFilter !== 'all';
  const filteredValue = filteredPositions.reduce((sum, p) => sum + p.value, 0);

  if (breakdownData.equityPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No equity positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add stock or ETF positions to track your equity holdings.
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
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL EQUITIES</p>
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

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'stocks', 'etfs'] as TypeFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setTypeFilter(filter)}
            className={`px-3 py-1.5 text-[12px] font-medium transition-all flex items-center gap-1.5 ${
              typeFilter === filter
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--background-secondary)] text-[var(--foreground)] hover:bg-[var(--background-tertiary)]'
            }`}
          >
            {filter !== 'all' && (
              <span
                className="w-2 h-2"
                style={{
                  backgroundColor: typeFilter === filter
                    ? 'white'
                    : filter === 'etfs'
                    ? SUBCATEGORY_COLORS.equities_etfs
                    : SUBCATEGORY_COLORS.equities_stocks,
                }}
              />
            )}
            {filter === 'all' ? 'All' : filter === 'etfs' ? 'ETFs' : 'Stocks'}
          </button>
        ))}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="hidden sm:block flex-1" />

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
        />

        <button
          onClick={toggleHideDust}
          className={`btn p-2 flex items-center gap-1.5 ${hideDust ? 'btn-primary' : 'btn-secondary'}`}
          title={hideDust ? `Showing positions >=$${DUST_THRESHOLD}` : 'Hide dust positions'}
        >
          {hideDust ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="text-xs">Dust</span>
        </button>

        <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {sortedPositions.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-full h-full" />}
          title="No positions found"
          description="No positions match your filters."
          size="sm"
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <SortableTableHeader field="symbol" label="Asset" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} />
                </th>
                <th className="table-header text-left pb-3">Type</th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="amount" label="Amount" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="price" label="Price" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="value" label="Value" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="change" label="24h" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">%</th>
                <th className="table-header text-right pb-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((position) => {
                const subCat = categoryService.getSubCategory(position.symbol, position.type);
                const isETF = subCat === 'etfs';

                return (
                  <tr
                    key={position.id}
                    className="group border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <StockIcon symbol={position.symbol} size={24} isETF={isETF} />
                        <div>
                          <p className="font-medium text-sm">{position.symbol.toUpperCase()}</p>
                          <p className="text-[11px] text-[var(--foreground-muted)] truncate max-w-[150px]">
                            {position.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: isETF ? `${SUBCATEGORY_COLORS.equities_etfs}1A` : `${SUBCATEGORY_COLORS.equities_stocks}1A`,
                          color: isETF ? SUBCATEGORY_COLORS.equities_etfs : SUBCATEGORY_COLORS.equities_stocks,
                        }}
                      >
                        {isETF ? 'ETF' : 'Stock'}
                      </span>
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
                          <span className="w-1.5 h-1.5 bg-[var(--accent-primary)]" />
                        )}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </button>
                    </td>
                    <td className="py-2 text-right font-semibold text-sm">
                      {hideBalances ? '••••' : formatCurrency(position.value)}
                    </td>
                    <td className={`py-2 text-right text-xs ${getChangeColor(position.changePercent24h)}`}>
                      {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                    </td>
                    <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                      {breakdownData.total > 0 ? ((position.value / breakdownData.total) * 100).toFixed(1) : '0.0'}%
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isManualPosition(position) ? (
                          <>
                            <button
                              onClick={() => handleEdit(position)}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--background-tertiary)] transition-all"
                              title="Edit position"
                            >
                              <Edit2 className="w-4 h-4 text-[var(--foreground-muted)]" />
                            </button>
                            <button
                              onClick={() => handleDelete(position)}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--background-tertiary)] transition-all"
                              title="Delete position"
                            >
                              <Trash2 className="w-4 h-4 text-[var(--foreground-muted)]" />
                            </button>
                          </>
                        ) : (
                          <span
                            className="p-1.5 opacity-0 group-hover:opacity-50 cursor-not-allowed"
                            title="Remove wallet to delete"
                          >
                            <Trash2 className="w-4 h-4 text-[var(--foreground-subtle)]" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {sortedPositions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {sortedPositions.length} position{sortedPositions.length !== 1 ? 's' : ''}
            {(hasActiveFilter || searchQuery) && ` (filtered)`}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency((hasActiveFilter || searchQuery) ? filteredValue : breakdownData.total)}
          </span>
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

      {/* Edit Position Modal */}
      {editAction && (
        <ConfirmPositionActionModal
          isOpen
          onClose={() => setEditAction(null)}
          parsedAction={editAction}
          positions={positions}
          positionsWithPrices={allPositionsWithPrices}
        />
      )}
    </div>
  );
}
