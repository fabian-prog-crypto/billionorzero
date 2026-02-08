'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronUp, ChevronDown, Download, Banknote } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCashBreakdown,
  extractCurrencyCode,
  aggregateCashByCurrency,
} from '@/services';
import CurrencyIcon from '@/components/ui/CurrencyIcon';
import SearchInput from '@/components/ui/SearchInput';
import { formatCurrency, formatNumber } from '@/lib/utils';

type SortField = 'currency' | 'value' | 'amount';
type SortDirection = 'asc' | 'desc';

export default function CashPositionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [includeStablecoins, setIncludeStablecoins] = useState(false);

  const { positions, prices, customPrices, fxRates, hideBalances } = usePortfolioStore();

  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const breakdownData = useMemo(() => {
    return calculateCashBreakdown(allPositions, true);
  }, [allPositions]);

  const cashPositions = useMemo(() => {
    const raw = includeStablecoins
      ? [...breakdownData.fiatPositions, ...breakdownData.stablecoinPositions]
      : breakdownData.fiatPositions;
    return aggregateCashByCurrency(raw);
  }, [breakdownData, includeStablecoins]);

  const displayTotal = useMemo(() => {
    if (includeStablecoins) {
      return breakdownData.total;
    }
    return breakdownData.fiat.value;
  }, [breakdownData, includeStablecoins]);

  // Filter by search
  const filteredPositions = useMemo(() => {
    if (!searchQuery) return cashPositions;
    const query = searchQuery.toLowerCase();
    return cashPositions.filter((p) => {
      const currencyCode = extractCurrencyCode(p.symbol).toLowerCase();
      const symbol = p.symbol.toLowerCase();
      return currencyCode.includes(query) || symbol.includes(query);
    });
  }, [cashPositions, searchQuery]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'currency': {
          const aCurrency = extractCurrencyCode(a.symbol);
          const bCurrency = extractCurrencyCode(b.symbol);
          comparison = aCurrency.localeCompare(bCurrency);
          break;
        }
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
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

  const exportCSV = () => {
    const headers = ['Currency', 'Amount', 'Value', 'Allocation'];
    const rows = sortedPositions.map((p) => {
      const pct = displayTotal > 0 ? (p.value / displayTotal) * 100 : 0;
      return [
        extractCurrencyCode(p.symbol),
        p.amount,
        p.value,
        pct.toFixed(2),
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
    a.download = `cash-positions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (breakdownData.fiatPositions.length === 0 && breakdownData.stablecoinPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Banknote className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No cash positions</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
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
            {includeStablecoins ? 'CASH & EQUIVALENTS' : 'FIAT CASH'}
          </p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(displayTotal)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {sortedPositions.length} currenc{sortedPositions.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        <button
          onClick={() => setIncludeStablecoins(!includeStablecoins)}
          className={`btn p-2 ${includeStablecoins ? 'btn-primary' : 'btn-secondary'}`}
        >
          <span className="text-xs">Include Stablecoins</span>
        </button>
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
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <button onClick={() => handleSort('currency')} className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors">
                    Currency {renderSortIcon('currency')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => handleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Amount {renderSortIcon('amount')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button onClick={() => handleSort('value')} className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors">
                    Value {renderSortIcon('value')}
                  </button>
                </th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((position) => {
                const percentage = displayTotal > 0 ? (position.value / displayTotal) * 100 : 0;
                const cleanSymbol = extractCurrencyCode(position.symbol);
                return (
                  <tr
                    key={cleanSymbol}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <td className="py-2">
                      <Link
                        href={`/cash/currency/${extractCurrencyCode(position.symbol).toLowerCase()}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <CurrencyIcon
                          symbol={cleanSymbol}
                          size={20}
                          logoUrl={position.logo}
                        />
                        <p className="font-medium text-sm hover:text-[var(--accent-primary)] transition-colors">{cleanSymbol}</p>
                      </Link>
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
      )}

      {/* Footer */}
      {sortedPositions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {sortedPositions.length} currenc{sortedPositions.length !== 1 ? 'ies' : 'y'}
            {searchQuery && ' (filtered)'}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency(searchQuery ? filteredPositions.reduce((sum, p) => sum + p.value, 0) : displayTotal)}
          </span>
        </div>
      )}
    </div>
  );
}
