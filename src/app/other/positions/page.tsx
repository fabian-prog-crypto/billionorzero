'use client';

import { useState, useMemo } from 'react';
import { Edit2, Trash2, Download, Package } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  getCategoryService,
} from '@/services';
import CryptoIcon from '@/components/ui/CryptoIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import SearchInput from '@/components/ui/SearchInput';
import SortableTableHeader from '@/components/ui/SortableTableHeader';
import {
  formatCurrency,
  formatNumber,
} from '@/lib/utils';
import { AssetWithPrice, ParsedPositionAction } from '@/types';

type SortField = 'symbol' | 'value' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function OtherPositionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });
  const [editAction, setEditAction] = useState<ParsedPositionAction | null>(null);

  const store = usePortfolioStore();
  const { positions, prices, customPrices, hideBalances, removePosition } = store;
  const categoryService = getCategoryService();

  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter to "other" category
  const otherPositions = useMemo(() => {
    return allPositionsWithPrices.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      return mainCat === 'other';
    });
  }, [allPositionsWithPrices, categoryService]);

  const totalValue = useMemo(() => {
    return otherPositions.reduce((sum, p) => sum + p.value, 0);
  }, [otherPositions]);

  // Filter by search
  const filteredPositions = useMemo(() => {
    if (!searchQuery) return otherPositions;
    const query = searchQuery.toLowerCase();
    return otherPositions.filter(
      (p) =>
        p.symbol.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query)
    );
  }, [otherPositions, searchQuery]);

  // Sort
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
    const headers = ['Symbol', 'Name', 'Amount', 'Price', 'Value', 'Allocation'];
    const rows = sortedPositions.map((p) => [
      p.symbol.toUpperCase(),
      p.name,
      p.amount,
      p.currentPrice,
      p.value,
      p.allocation,
    ]);
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `other-assets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (otherPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No other positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add manually-tracked assets like real estate, private equity, or collectibles.
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
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">OTHER ASSETS</p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(totalValue)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {otherPositions.length} position{otherPositions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1" />

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
        />

        <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      {sortedPositions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">No positions match your search.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <SortableTableHeader field="symbol" label="Asset" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} />
                </th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="amount" label="Amount" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">
                  <SortableTableHeader field="value" label="Value" currentField={sortField} direction={sortDirection} onSort={(f) => toggleSort(f as SortField)} align="right" />
                </th>
                <th className="table-header text-right pb-3">%</th>
                <th className="table-header text-right pb-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((position) => (
                <tr
                  key={position.id}
                  className="group border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <CryptoIcon symbol={position.symbol} size={24} logoUrl={position.logo} />
                      <div>
                        <p className="font-medium text-sm">{position.symbol.toUpperCase()}</p>
                        <p className="text-[11px] text-[var(--foreground-muted)] truncate max-w-[150px]">
                          {position.name}
                        </p>
                      </div>
                    </div>
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
                  <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                    {totalValue > 0 ? ((position.value / totalValue) * 100).toFixed(1) : '0.0'}%
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isManualPosition(position) && (
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
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {sortedPositions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {sortedPositions.length} position{sortedPositions.length !== 1 ? 's' : ''}
            {searchQuery && ' (filtered)'}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency(searchQuery ? filteredPositions.reduce((sum, p) => sum + p.value, 0) : totalValue)}
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
