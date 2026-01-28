'use client';

import { useMemo, useState } from 'react';
import { Banknote, ArrowUpDown, ChevronDown, ChevronUp, Wallet, Building2 } from 'lucide-react';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCashBreakdown,
} from '@/services';
import { formatCurrency, formatNumber, formatAddress } from '@/lib/utils';
import { CURRENCY_COLORS } from '@/lib/colors';
import SearchInput from '@/components/ui/SearchInput';
import CurrencyIcon from '@/components/ui/CurrencyIcon';

type SortField = 'symbol' | 'value' | 'amount' | 'source';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'fiat' | 'stablecoins' | 'all';

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
  return sortDirection === 'asc' ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}

// Get friendly name for position
function getPositionDisplayName(position: { symbol: string; name: string; walletAddress?: string; protocol?: string; chain?: string }): string {
  const symbol = position.symbol.toUpperCase();

  // If it has a protocol, include that
  if (position.protocol) {
    return `${symbol} (${position.protocol})`;
  }

  // If it's from a wallet, indicate the chain
  if (position.walletAddress && position.chain) {
    const chainName = position.chain.charAt(0).toUpperCase() + position.chain.slice(1);
    return `${symbol} on ${chainName}`;
  }

  // If name is just the symbol or very similar, make it descriptive
  if (position.name.toLowerCase() === symbol.toLowerCase() ||
      position.name.toLowerCase().includes(symbol.toLowerCase())) {
    // Check if it seems like a bank account
    if (!position.walletAddress && !position.protocol) {
      return `${symbol} Cash`;
    }
  }

  return position.name;
}

export default function CashPage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Use centralized service for cash breakdown - include stablecoins for full breakdown
  const breakdownData = useMemo(() => {
    return calculateCashBreakdown(allPositions, true);
  }, [allPositions]);

  // Combined cash positions based on view mode
  const cashPositions = useMemo(() => {
    switch (viewMode) {
      case 'fiat':
        return breakdownData.fiatPositions;
      case 'stablecoins':
        return breakdownData.stablecoinPositions;
      case 'all':
      default:
        return [...breakdownData.fiatPositions, ...breakdownData.stablecoinPositions];
    }
  }, [breakdownData, viewMode]);

  // Calculate total based on view mode
  const displayTotal = useMemo(() => {
    switch (viewMode) {
      case 'fiat':
        return breakdownData.fiat.value;
      case 'stablecoins':
        return breakdownData.stablecoins.value;
      case 'all':
      default:
        return breakdownData.total;
    }
  }, [breakdownData, viewMode]);

  // Filter and sort positions (UI-only logic)
  const filteredPositions = useMemo(() => {
    let filtered = cashPositions;

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
        case 'source': {
          const aSource = a.walletAddress ? 'wallet' : 'manual';
          const bSource = b.walletAddress ? 'wallet' : 'manual';
          comparison = aSource.localeCompare(bSource);
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [cashPositions, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Build chart data with breakdowns for tooltips
  const chartData = useMemo((): DonutChartItem[] => {
    // Group positions by currency symbol
    const bySymbol = new Map<string, { value: number; positions: { label: string; value: number }[] }>();

    cashPositions.forEach((p) => {
      const symbol = p.symbol.toUpperCase();
      const existing = bySymbol.get(symbol) || { value: 0, positions: [] };
      existing.value += p.value;
      existing.positions.push({
        label: getPositionDisplayName(p),
        value: p.value,
      });
      bySymbol.set(symbol, existing);
    });

    return Array.from(bySymbol.entries()).map(([symbol, data]) => ({
      label: symbol,
      value: data.value,
      color: CURRENCY_COLORS[symbol] || CURRENCY_COLORS[symbol.toUpperCase()] || '#6B7280',
      breakdown: data.positions.sort((a, b) => b.value - a.value),
    }));
  }, [cashPositions]);

  if (breakdownData.fiatPositions.length === 0 && breakdownData.stablecoinPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
            <Banknote className="w-10 h-10 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No cash positions</h2>
          <p className="text-[var(--foreground-muted)] text-center max-w-md">
            Add cash or stablecoin positions to track your liquid holdings.
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
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
            {viewMode === 'all' ? 'TOTAL CASH & EQUIVALENTS' : viewMode === 'fiat' ? 'FIAT CURRENCIES' : 'STABLECOINS'}
          </p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(displayTotal)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Fiat</p>
            <p className="text-[15px] font-medium">{hideBalances ? '••••' : formatCurrency(breakdownData.fiat.value)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Stablecoins</p>
            <p className="text-[15px] font-medium">{hideBalances ? '••••' : formatCurrency(breakdownData.stablecoins.value)}</p>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <div className="inline-flex rounded-lg bg-[var(--background-secondary)] p-0.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'fiat', label: 'Fiat' },
            { value: 'stablecoins', label: 'Stablecoins' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setViewMode(option.value as ViewMode)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                viewMode === option.value
                  ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pie Chart - Currency Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <DonutChart
          title="By Currency"
          data={chartData}
          hideValues={hideBalances}
          maxItems={6}
        />

        {/* Summary Cards */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          {/* Fiat Summary */}
          <div className="p-4 rounded-xl bg-[var(--background-secondary)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--positive)]20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[var(--positive)]" />
              </div>
              <div>
                <p className="text-[11px] text-[var(--foreground-muted)]">Fiat Currencies</p>
                <p className="text-[15px] font-semibold">
                  {hideBalances ? '••••' : formatCurrency(breakdownData.fiat.value)}
                </p>
              </div>
            </div>
            <div className="text-[12px] text-[var(--foreground-muted)]">
              {breakdownData.fiat.count} position{breakdownData.fiat.count !== 1 ? 's' : ''}
              {breakdownData.total > 0 && (
                <span> · {((breakdownData.fiat.value / breakdownData.total) * 100).toFixed(0)}% of total</span>
              )}
            </div>
          </div>

          {/* Stablecoin Summary */}
          <div className="p-4 rounded-xl bg-[var(--background-secondary)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]20 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <div>
                <p className="text-[11px] text-[var(--foreground-muted)]">Stablecoins</p>
                <p className="text-[15px] font-semibold">
                  {hideBalances ? '••••' : formatCurrency(breakdownData.stablecoins.value)}
                </p>
              </div>
            </div>
            <div className="text-[12px] text-[var(--foreground-muted)]">
              {breakdownData.stablecoins.count} position{breakdownData.stablecoins.count !== 1 ? 's' : ''}
              {breakdownData.total > 0 && (
                <span> · {((breakdownData.stablecoins.value / breakdownData.total) * 100).toFixed(0)}% of total</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Search and Count */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search currencies..."
          className="flex-1 max-w-xs"
        />
        <span className="text-[12px] text-[var(--foreground-muted)]">
          {filteredPositions.length} of {cashPositions.length}
        </span>
      </div>

      {/* Positions Table */}
      <div className="table-scroll">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('symbol')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Currency <SortIcon field="symbol" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('source')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Source <SortIcon field="source" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Amount <SortIcon field="amount" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('value')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Value <SortIcon field="value" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th className="table-header text-right pb-3">%</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map((position) => {
              const percentage = displayTotal > 0 ? (position.value / displayTotal) * 100 : 0;
              const displayName = getPositionDisplayName(position);

              return (
                <tr
                  key={position.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <CurrencyIcon
                        symbol={position.symbol}
                        size={24}
                        logoUrl={position.logo}
                      />
                      <div>
                        <p className="font-medium text-sm">{position.symbol.toUpperCase()}</p>
                        <p className="text-[11px] text-[var(--foreground-muted)] truncate max-w-[180px]">
                          {displayName}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2">
                    {position.walletAddress ? (
                      <div className="flex items-center gap-1.5">
                        <Wallet className="w-3 h-3 text-[var(--accent-primary)]" />
                        <span className="text-[11px] font-mono text-[var(--foreground-muted)]">
                          {formatAddress(position.walletAddress, 4)}
                        </span>
                        {position.chain && (
                          <span className="tag text-[9px] py-0.5 px-1">
                            {position.chain}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-[var(--foreground-muted)]" />
                        <span className="text-[11px] text-[var(--foreground-muted)]">
                          Manual
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    {hideBalances ? '••••' : formatNumber(position.amount)}
                  </td>
                  <td className="py-2 text-right font-semibold text-sm">
                    {hideBalances ? '••••' : formatCurrency(position.value)}
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                    {percentage.toFixed(1)}%
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

      {/* Footer Summary */}
      {filteredPositions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency(displayTotal)}
          </span>
        </div>
      )}
    </div>
  );
}
