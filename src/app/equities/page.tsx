'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, Download, Edit2 } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateEquitiesBreakdown,
  calculateExposureData,
  getCategoryService,
} from '@/services';
import { formatCurrency, formatNumber, formatPercent, getChangeColor } from '@/lib/utils';
import { SUBCATEGORY_COLORS } from '@/lib/colors';
import SearchInput from '@/components/ui/SearchInput';
import SortableTableHeader from '@/components/ui/SortableTableHeader';
import StockIcon from '@/components/ui/StockIcon';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import type { ParsedPositionAction, AssetWithPrice } from '@/types';

type SortField = 'symbol' | 'value' | 'amount' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';

export default function EquitiesPage() {
  const { positions, prices, customPrices, fxRates, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [editAction, setEditAction] = useState<ParsedPositionAction | null>(null);

  const handleEdit = (position: AssetWithPrice) => {
    // Only allow editing manual (non-wallet-synced) positions
    if (position.accountId) {
      const store = usePortfolioStore.getState();
      const account = store.accounts.find(a => a.id === position.accountId);
      if (account && (account.connection.dataSource === 'debank' || account.connection.dataSource === 'helius')) {
        return; // Can't edit wallet-synced positions
      }
    }
    setEditAction({
      action: 'update_position',
      symbol: position.symbol,
      name: position.name,
      assetType: position.type,
      amount: position.amount,
      costBasis: position.costBasis,
      date: position.purchaseDate,
      matchedPositionId: position.id,
      confidence: 1,
      summary: `Edit ${position.symbol.toUpperCase()} position`,
    });
  };

  const categoryService = getCategoryService();

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  // Use centralized service for equities breakdown - SINGLE SOURCE OF TRUTH
  const breakdownData = useMemo(() => {
    return calculateEquitiesBreakdown(allPositions);
  }, [allPositions]);

  const exposureData = useMemo(() => {
    return calculateExposureData(breakdownData.equityPositions);
  }, [breakdownData.equityPositions]);

  const netExposure = exposureData.exposureMetrics.netExposure;
  const netWorth = exposureData.exposureMetrics.netWorth;
  const netExposurePercent = netWorth !== 0 ? (netExposure / netWorth) * 100 : 0;

  // Filter and sort positions (UI-only logic)
  const filteredPositions = useMemo(() => {
    let filtered = breakdownData.equityPositions;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
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
  }, [breakdownData.equityPositions, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportCSV = () => {
    const headers = ['Symbol', 'Name', 'Type', 'Amount', 'Price', 'Value', '24h Change', 'Allocation'];
    const rows = filteredPositions.map((p) => {
      const categoryInput = p.assetClassOverride ?? p.assetClass ?? p.type;
      const subCat = categoryService.getSubCategory(p.symbol, categoryInput);
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
    a.download = `equities-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (breakdownData.equityPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14  bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <TrendingUp className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No equity positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add stock or ETF positions to track your equity portfolio.
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
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">TOTAL EQUITIES</p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(breakdownData.total)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            Stocks and ETFs in your portfolio
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">NET EXPOSURE</p>
          <p className="text-[13px] font-medium">
            {hideBalances ? '••••' : formatCurrency(netExposure)}
          </p>
          <p className="text-[11px] text-[var(--foreground-muted)]">
            {hideBalances ? '••••' : `${formatPercent(netExposurePercent, 1)} of net worth`}
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Pie Chart - Stocks vs ETFs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <DonutChart
          title="Stocks vs ETFs"
          data={breakdownData.chartData}
          hideValues={hideBalances}
          maxItems={2}
        />

        {/* Summary Stats */}
        <div className="md:col-span-2">
          <h3 className="text-[15px] font-medium mb-4">Breakdown</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 " style={{ backgroundColor: SUBCATEGORY_COLORS.equities_stocks }} />
                <span className="text-[13px] font-medium">Individual Stocks</span>
              </div>
              <p className="text-xl font-semibold mb-1">
                {hideBalances ? '••••' : formatCurrency(breakdownData.stocks.value)}
              </p>
              <p className="text-[13px] text-[var(--foreground-muted)]">
                {breakdownData.stocks.count} position{breakdownData.stocks.count !== 1 ? 's' : ''} &middot; {breakdownData.total > 0 ? ((breakdownData.stocks.value / breakdownData.total) * 100).toFixed(1) : 0}%
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 " style={{ backgroundColor: SUBCATEGORY_COLORS.equities_etfs }} />
                <span className="text-[13px] font-medium">ETFs</span>
              </div>
              <p className="text-xl font-semibold mb-1">
                {hideBalances ? '••••' : formatCurrency(breakdownData.etfs.value)}
              </p>
              <p className="text-[13px] text-[var(--foreground-muted)]">
                {breakdownData.etfs.count} position{breakdownData.etfs.count !== 1 ? 's' : ''} &middot; {breakdownData.total > 0 ? ((breakdownData.etfs.value / breakdownData.total) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="hidden sm:block flex-1" />

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
        />

        <button onClick={exportCSV} className="btn btn-secondary p-2" title="Export CSV">
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Positions Table */}
      <div className="table-scroll">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">
                <SortableTableHeader field="symbol" label="Asset" currentField={sortField} direction={sortDirection} onSort={(f) => handleSort(f as SortField)} />
              </th>
              <th className="table-header text-left pb-3">Type</th>
              <th className="table-header text-right pb-3">
                <SortableTableHeader field="amount" label="Amount" currentField={sortField} direction={sortDirection} onSort={(f) => handleSort(f as SortField)} align="right" />
              </th>
              <th className="table-header text-right pb-3">
                <SortableTableHeader field="price" label="Price" currentField={sortField} direction={sortDirection} onSort={(f) => handleSort(f as SortField)} align="right" />
              </th>
              <th className="table-header text-right pb-3">
                <SortableTableHeader field="value" label="Value" currentField={sortField} direction={sortDirection} onSort={(f) => handleSort(f as SortField)} align="right" />
              </th>
              <th className="table-header text-right pb-3">
                <SortableTableHeader field="change" label="24h" currentField={sortField} direction={sortDirection} onSort={(f) => handleSort(f as SortField)} align="right" />
              </th>
              <th className="table-header text-right pb-3">%</th>
              <th className="table-header text-right pb-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map((position) => {
              const categoryInput = position.assetClassOverride ?? position.assetClass ?? position.type;
              const subCat = categoryService.getSubCategory(position.symbol, categoryInput);
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
                    {hideBalances ? '••••' : formatNumber(position.amount)}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                  </td>
                  <td className="py-2 text-right font-semibold text-sm">
                    {hideBalances ? '••••' : formatCurrency(position.value)}
                  </td>
                  <td className={`py-2 text-right text-xs ${getChangeColor(position.changePercent24h)}`}>
                    {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                    {position.allocation.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleEdit(position)}
                      className="p-1.5 hover:bg-[var(--background-tertiary)] text-[var(--foreground-muted)] transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit position"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredPositions.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">No positions match your search.</p>
        </div>
      )}

      {editAction && (
        <ConfirmPositionActionModal
          isOpen={!!editAction}
          onClose={() => setEditAction(null)}
          parsedAction={editAction}
          positions={positions}
          positionsWithPrices={allPositions}
        />
      )}
    </div>
  );
}
