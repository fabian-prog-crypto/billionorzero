'use client';

import { useMemo, useState } from 'react';
import { Banknote, ArrowUpDown, ChevronDown, ChevronUp, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  getCategoryService,
} from '@/services';
import { formatCurrency, formatNumber } from '@/lib/utils';
import Header from '@/components/Header';

type SortField = 'symbol' | 'value' | 'amount' | 'category';
type SortDirection = 'asc' | 'desc';

export default function CashPage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeStablecoins, setIncludeStablecoins] = useState(true);

  const categoryService = getCategoryService();

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter to cash positions only (fiat)
  const fiatPositions = useMemo(() => {
    return allPositions.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      return mainCat === 'cash';
    });
  }, [allPositions, categoryService]);

  // Filter to stablecoin positions (crypto stablecoins)
  const stablecoinPositions = useMemo(() => {
    return allPositions.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      const subCat = categoryService.getSubCategory(p.symbol, p.type);
      return mainCat === 'crypto' && subCat === 'stablecoins';
    });
  }, [allPositions, categoryService]);

  // Combined cash positions based on toggle
  const cashPositions = useMemo(() => {
    if (includeStablecoins) {
      return [...fiatPositions, ...stablecoinPositions];
    }
    return fiatPositions;
  }, [fiatPositions, stablecoinPositions, includeStablecoins]);

  // Calculate breakdown data
  const breakdownData = useMemo(() => {
    const fiat = { value: 0, count: 0 };
    const stablecoins = { value: 0, count: 0 };

    fiatPositions.forEach((p) => {
      fiat.value += p.value;
      fiat.count++;
    });

    stablecoinPositions.forEach((p) => {
      stablecoins.value += p.value;
      stablecoins.count++;
    });

    const total = includeStablecoins ? fiat.value + stablecoins.value : fiat.value;

    // Calculate by currency for pie chart
    const currencyMap: Record<string, { value: number; count: number }> = {};

    const positionsToAnalyze = includeStablecoins
      ? [...fiatPositions, ...stablecoinPositions]
      : fiatPositions;

    positionsToAnalyze.forEach((p) => {
      const currency = p.symbol.toUpperCase();
      if (!currencyMap[currency]) {
        currencyMap[currency] = { value: 0, count: 0 };
      }
      currencyMap[currency].value += p.value;
      currencyMap[currency].count++;
    });

    // Define colors for common currencies
    const currencyColors: Record<string, string> = {
      'USD': '#4CAF50',
      'EUR': '#2196F3',
      'GBP': '#9C27B0',
      'CHF': '#F44336',
      'JPY': '#FF9800',
      'USDT': '#26A17B',
      'USDC': '#2775CA',
      'DAI': '#F5AC37',
      'BUSD': '#F0B90B',
      'FRAX': '#000000',
      'USDE': '#1E88E5',
      'SUSDE': '#1565C0',
    };

    // Generate chartData sorted by value
    const chartData = Object.entries(currencyMap)
      .map(([currency, data]) => ({
        label: currency,
        value: data.value,
        color: currencyColors[currency] || '#6B7280',
      }))
      .sort((a, b) => b.value - a.value);

    return {
      fiat,
      stablecoins,
      total,
      chartData,
    };
  }, [fiatPositions, stablecoinPositions, includeStablecoins]);

  // Filter and sort positions
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
        case 'category': {
          const aCat = categoryService.getMainCategory(a.symbol, a.type);
          const bCat = categoryService.getMainCategory(b.symbol, b.type);
          comparison = aCat.localeCompare(bCat);
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [cashPositions, searchQuery, sortField, sortDirection, categoryService]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
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

  // Determine if position is stablecoin or fiat
  const isStablecoin = (position: typeof cashPositions[0]) => {
    const mainCat = categoryService.getMainCategory(position.symbol, position.type);
    return mainCat === 'crypto';
  };

  if (fiatPositions.length === 0 && stablecoinPositions.length === 0) {
    return (
      <div>
        <Header title="Cash" />
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
      <Header title="Cash" />

      {/* Header Stats */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
            TOTAL {includeStablecoins ? 'CASH & EQUIVALENTS' : 'FIAT CASH'}
          </p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(breakdownData.total)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {includeStablecoins ? 'Fiat currencies and stablecoins' : 'Fiat currencies only'}
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Fiat</p>
            <p className="text-[13px] font-medium">{breakdownData.fiat.count}</p>
          </div>
          {includeStablecoins && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Stablecoins</p>
              <p className="text-[13px] font-medium">{breakdownData.stablecoins.count}</p>
            </div>
          )}
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Stablecoin Toggle */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setIncludeStablecoins(!includeStablecoins)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--background-secondary)] transition-colors"
        >
          {includeStablecoins ? (
            <ToggleRight className="w-5 h-5 text-[var(--accent)]" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-[var(--foreground-muted)]" />
          )}
          <span className="text-[13px]">Include Stablecoins</span>
        </button>
      </div>

      {/* Pie Chart - Currency Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <DonutChart
          title="By Currency"
          data={breakdownData.chartData}
          hideValues={hideBalances}
          maxItems={6}
        />

        {/* Summary Stats */}
        <div className="md:col-span-2">
          <h3 className="text-[15px] font-medium mb-4">Breakdown</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#4CAF50' }} />
                <span className="text-[13px] font-medium">Fiat Currencies</span>
              </div>
              <p className="text-xl font-semibold mb-1">
                {hideBalances ? '••••' : formatCurrency(breakdownData.fiat.value)}
              </p>
              <p className="text-[13px] text-[var(--foreground-muted)]">
                {breakdownData.fiat.count} position{breakdownData.fiat.count !== 1 ? 's' : ''} &middot; {breakdownData.total > 0 ? ((breakdownData.fiat.value / breakdownData.total) * 100).toFixed(1) : 0}%
              </p>
            </div>
            {includeStablecoins && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#26A17B' }} />
                  <span className="text-[13px] font-medium">Stablecoins</span>
                </div>
                <p className="text-xl font-semibold mb-1">
                  {hideBalances ? '••••' : formatCurrency(breakdownData.stablecoins.value)}
                </p>
                <p className="text-[13px] text-[var(--foreground-muted)]">
                  {breakdownData.stablecoins.count} position{breakdownData.stablecoins.count !== 1 ? 's' : ''} &middot; {breakdownData.total > 0 ? ((breakdownData.stablecoins.value / breakdownData.total) * 100).toFixed(1) : 0}%
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <span className="text-[13px] text-[var(--foreground-muted)]">
          {filteredPositions.length} position{filteredPositions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Positions Table */}
      <div className="table-scroll">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('symbol')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Currency <SortIcon field="symbol" />
                </button>
              </th>
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('category')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Type <SortIcon field="category" />
                </button>
              </th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Amount <SortIcon field="amount" />
                </button>
              </th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('value')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Value <SortIcon field="value" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map((position) => {
              const isStable = isStablecoin(position);

              return (
                <tr
                  key={position.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: isStable ? '#26A17B' : '#4CAF50' }}
                      >
                        {position.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{position.symbol.toUpperCase()}</p>
                        <p className="text-xs text-[var(--foreground-muted)] truncate max-w-[150px]">
                          {position.name}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <span
                      className="px-2 py-1 text-xs font-medium rounded"
                      style={{
                        backgroundColor: isStable ? 'rgba(38, 161, 123, 0.1)' : 'rgba(76, 175, 80, 0.1)',
                        color: isStable ? '#26A17B' : '#4CAF50',
                      }}
                    >
                      {isStable ? 'Stablecoin' : 'Fiat'}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {hideBalances ? '••••' : formatNumber(position.amount)}
                  </td>
                  <td className="py-3 text-right font-semibold">
                    {hideBalances ? '••••' : formatCurrency(position.value)}
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
    </div>
  );
}
