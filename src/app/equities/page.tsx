'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, ArrowUpDown, ChevronDown, ChevronUp, Search } from 'lucide-react';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
import type { AssetWithPrice } from '@/types';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  getCategoryService,
} from '@/services';
import { formatCurrency, formatNumber, formatPercent, getChangeColor } from '@/lib/utils';
import Header from '@/components/Header';

type SortField = 'symbol' | 'value' | 'amount' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';

export default function EquitiesPage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const categoryService = getCategoryService();

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter to equities only
  const equityPositions = useMemo(() => {
    return allPositions.filter((p) => {
      const mainCat = categoryService.getMainCategory(p.symbol, p.type);
      return mainCat === 'equities';
    });
  }, [allPositions, categoryService]);

  // Helper to aggregate positions by symbol
  const aggregateBySymbol = (positions: AssetWithPrice[]) => {
    const map = new Map<string, number>();
    positions.forEach(p => {
      const key = p.symbol.toUpperCase();
      map.set(key, (map.get(key) || 0) + Math.abs(p.value));
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Calculate stocks vs ETFs breakdown
  const breakdownData = useMemo(() => {
    const stockPositions: AssetWithPrice[] = [];
    const etfPositions: AssetWithPrice[] = [];

    equityPositions.forEach((p) => {
      const subCat = categoryService.getSubCategory(p.symbol, p.type);
      if (subCat === 'etfs') {
        etfPositions.push(p);
      } else {
        stockPositions.push(p);
      }
    });

    const stocksValue = stockPositions.reduce((sum, p) => sum + Math.abs(p.value), 0);
    const etfsValue = etfPositions.reduce((sum, p) => sum + Math.abs(p.value), 0);
    const total = stocksValue + etfsValue;

    const chartData: DonutChartItem[] = [];
    if (stocksValue > 0) {
      chartData.push({
        label: 'Stocks',
        value: stocksValue,
        color: '#E91E63',
        breakdown: aggregateBySymbol(stockPositions),
      });
    }
    if (etfsValue > 0) {
      chartData.push({
        label: 'ETFs',
        value: etfsValue,
        color: '#9C27B0',
        breakdown: aggregateBySymbol(etfPositions),
      });
    }

    return {
      stocks: { value: stocksValue, count: stockPositions.length },
      etfs: { value: etfsValue, count: etfPositions.length },
      total,
      chartData,
    };
  }, [equityPositions, categoryService]);

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let filtered = equityPositions;

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
  }, [equityPositions, searchQuery, sortField, sortDirection]);

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

  if (equityPositions.length === 0) {
    return (
      <div>
        <Header title="Equities" />
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-20 h-20 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6">
            <TrendingUp className="w-10 h-10 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No equity positions</h2>
          <p className="text-[var(--foreground-muted)] text-center max-w-md">
            Add stock or ETF positions to track your equity portfolio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Equities" />

      {/* Header Stats */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL EQUITIES</p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(breakdownData.total)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            Stocks and ETFs in your portfolio
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Stocks</p>
            <p className="text-[13px] font-medium">{breakdownData.stocks.count}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">ETFs</p>
            <p className="text-[13px] font-medium">{breakdownData.etfs.count}</p>
          </div>
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
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#E91E63' }} />
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
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9C27B0' }} />
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
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('symbol')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Symbol <SortIcon field="symbol" />
                </button>
              </th>
              <th className="table-header text-left pb-3">Type</th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Shares <SortIcon field="amount" />
                </button>
              </th>
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('price')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  Price <SortIcon field="price" />
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
              <th className="table-header text-right pb-3">
                <button
                  onClick={() => handleSort('change')}
                  className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                >
                  24h <SortIcon field="change" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.map((position) => {
              const subCat = categoryService.getSubCategory(position.symbol, position.type);
              const isETF = subCat === 'etfs';

              return (
                <tr
                  key={position.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: isETF ? '#9C27B0' : '#E91E63' }}
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
                        backgroundColor: isETF ? 'rgba(156, 39, 176, 0.1)' : 'rgba(233, 30, 99, 0.1)',
                        color: isETF ? '#9C27B0' : '#E91E63',
                      }}
                    >
                      {isETF ? 'ETF' : 'Stock'}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {hideBalances ? '••••' : formatNumber(position.amount)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                  </td>
                  <td className="py-3 text-right font-semibold">
                    {hideBalances ? '••••' : formatCurrency(position.value)}
                  </td>
                  <td className={`py-3 text-right ${getChangeColor(position.changePercent24h)}`}>
                    {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
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
