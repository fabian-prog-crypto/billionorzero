'use client';

import { useMemo, useState } from 'react';
import { Banknote, ArrowUpDown, ChevronDown, ChevronUp, Wallet, Building2 } from 'lucide-react';
import DonutChart, { DonutChartItem } from '@/components/charts/DonutChart';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCashBreakdown,
  extractCurrencyCode,
  extractAccountName,
  getUnderlyingFiatCurrency,
} from '@/services';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { CURRENCY_COLORS } from '@/lib/colors';
import CurrencyIcon from '@/components/ui/CurrencyIcon';

type SortField = 'account' | 'currency' | 'value' | 'amount';
type SortDirection = 'asc' | 'desc';

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
  return sortDirection === 'asc' ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}


export default function CashPage() {
  const { positions, prices, customPrices, fxRates, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [includeStablecoins, setIncludeStablecoins] = useState(false);

  // Calculate all positions with prices (including FX conversion for fiat)
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  // Use centralized service for cash breakdown - always get full data
  const breakdownData = useMemo(() => {
    return calculateCashBreakdown(allPositions, true);
  }, [allPositions]);

  // Combined cash positions based on toggle
  const cashPositions = useMemo(() => {
    if (includeStablecoins) {
      return [...breakdownData.fiatPositions, ...breakdownData.stablecoinPositions];
    }
    return breakdownData.fiatPositions;
  }, [breakdownData, includeStablecoins]);

  // Calculate total based on toggle
  const displayTotal = useMemo(() => {
    if (includeStablecoins) {
      return breakdownData.total;
    }
    return breakdownData.fiat.value;
  }, [breakdownData, includeStablecoins]);


  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...cashPositions].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'account': {
          const aName = extractAccountName(a);
          const bName = extractAccountName(b);
          comparison = aName.localeCompare(bName);
          break;
        }
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
  }, [cashPositions, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Build currency chart data with breakdowns for tooltips
  // Maps stablecoins and PTs to their underlying currency (e.g., USDC -> USD, PT-sUSDe -> USD)
  const currencyChartData = useMemo((): DonutChartItem[] => {
    // Group positions by underlying currency
    const byCurrency = new Map<string, { value: number; positions: { label: string; value: number }[] }>();

    cashPositions.forEach((p) => {
      // Use centralized service to get underlying fiat, fallback to extracted currency code
      const underlyingCurrency = getUnderlyingFiatCurrency(p.symbol) || extractCurrencyCode(p.symbol);
      const existing = byCurrency.get(underlyingCurrency) || { value: 0, positions: [] };
      existing.value += p.value;
      existing.positions.push({
        label: `${extractAccountName(p)} (${extractCurrencyCode(p.symbol)})`,
        value: p.value,
      });
      byCurrency.set(underlyingCurrency, existing);
    });

    return Array.from(byCurrency.entries()).map(([currency, data]) => ({
      label: currency,
      value: data.value,
      color: CURRENCY_COLORS[currency] || CURRENCY_COLORS[currency.toUpperCase()] || '#6B7280',
      breakdown: data.positions.sort((a, b) => b.value - a.value),
    }));
  }, [cashPositions]);

  // Build secondary chart data
  // - Fiat only: Show breakdown by Bank/Institution
  // - With stablecoins: Show breakdown by underlying stablecoin (USDC, USDT, DAI, etc.)
  const secondaryChartData = useMemo((): { title: string; data: DonutChartItem[] } => {
    if (!includeStablecoins) {
      // Fiat only: Show breakdown by Bank/Institution
      const byInstitution = new Map<string, { value: number; currencies: { label: string; value: number }[] }>();

      breakdownData.fiatPositions.forEach((p) => {
        if (p.value <= 0) return;
        const institution = extractAccountName(p);
        const existing = byInstitution.get(institution) || { value: 0, currencies: [] };
        existing.value += p.value;
        existing.currencies.push({
          label: extractCurrencyCode(p.symbol),
          value: p.value,
        });
        byInstitution.set(institution, existing);
      });

      const institutionColors: Record<string, string> = {
        'Millennium': '#00529B',
        'Wise': '#9FE870',
        'Revolut': '#0066FF',
        'N26': '#36A18B',
        'Monzo': '#FF3B6E',
        'Interactive Brokers': '#DC143C',
      };

      const data = Array.from(byInstitution.entries()).map(([name, info]) => {
        let color = institutionColors[name];
        if (!color) {
          const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
          const hue = Math.abs(hash) % 360;
          color = `hsl(${hue}, 60%, 50%)`;
        }
        return {
          label: name,
          value: info.value,
          color,
          breakdown: info.currencies.sort((a, b) => b.value - a.value),
        };
      }).sort((a, b) => b.value - a.value);

      return { title: 'By Bank', data };
    }

    // With stablecoins: Show Fiat vs Stablecoins breakdown
    const data: DonutChartItem[] = [];

    if (breakdownData.fiat.value > 0) {
      data.push({
        label: 'Fiat',
        value: breakdownData.fiat.value,
        color: '#4CAF50',
        breakdown: breakdownData.fiatPositions
          .filter(p => p.value > 0)
          .map(p => ({ label: `${extractAccountName(p)} (${extractCurrencyCode(p.symbol)})`, value: p.value }))
          .sort((a, b) => b.value - a.value),
      });
    }

    if (breakdownData.stablecoins.value > 0) {
      data.push({
        label: 'Stablecoins',
        value: breakdownData.stablecoins.value,
        color: '#2775CA',
        breakdown: breakdownData.stablecoinPositions
          .filter(p => p.value > 0)
          .map(p => ({ label: `${extractAccountName(p)} (${extractCurrencyCode(p.symbol)})`, value: p.value }))
          .sort((a, b) => b.value - a.value),
      });
    }

    return { title: 'By Type', data };
  }, [breakdownData, includeStablecoins]);

  if (breakdownData.fiatPositions.length === 0 && breakdownData.stablecoinPositions.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14  bg-[var(--background-secondary)] flex items-center justify-center mb-4">
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
            {sortedPositions.length} position{sortedPositions.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-start gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Fiat</p>
            <p className="text-[15px] font-medium">{hideBalances ? '••••' : formatCurrency(breakdownData.fiat.value)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Stablecoins</p>
            <p className="text-[15px] font-medium">{hideBalances ? '••••' : formatCurrency(breakdownData.stablecoins.value)}</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={includeStablecoins}
              onChange={(e) => setIncludeStablecoins(e.target.checked)}
              className="w-4 h-4  border-[var(--border)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 bg-[var(--background-secondary)]"
            />
            <span className="text-[12px] text-[var(--foreground-muted)]">Include Stablecoins</span>
          </label>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Two Pie Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
        <DonutChart
          title="By Currency"
          data={currencyChartData}
          hideValues={hideBalances}
          maxItems={6}
        />
        <DonutChart
          title={secondaryChartData.title}
          data={secondaryChartData.data}
          hideValues={hideBalances}
          maxItems={6}
        />
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Positions Table */}
      <div className="table-scroll">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('account')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Account <SortIcon field="account" sortField={sortField} sortDirection={sortDirection} />
                </button>
              </th>
              <th className="table-header text-left pb-3">
                <button
                  onClick={() => handleSort('currency')}
                  className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                >
                  Currency <SortIcon field="currency" sortField={sortField} sortDirection={sortDirection} />
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
            {sortedPositions.map((position) => {
              const percentage = displayTotal > 0 ? (position.value / displayTotal) * 100 : 0;
              const cleanSymbol = extractCurrencyCode(position.symbol);
              const accountName = extractAccountName(position);
              const isWallet = !!position.walletAddress;

              return (
                <tr
                  key={position.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                >
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {isWallet ? (
                        <Wallet className="w-4 h-4 text-[var(--accent-primary)] flex-shrink-0" />
                      ) : (
                        <Building2 className="w-4 h-4 text-[var(--foreground-muted)] flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{accountName}</p>
                        {position.protocol && position.protocol !== 'wallet' && (
                          <p className="text-[10px] text-[var(--foreground-muted)]">
                            {position.protocol}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <CurrencyIcon
                        symbol={cleanSymbol}
                        size={20}
                        logoUrl={position.logo}
                      />
                      <span className="text-sm font-medium">{cleanSymbol}</span>
                    </div>
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

      {/* Footer Summary */}
      {sortedPositions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {sortedPositions.length} position{sortedPositions.length !== 1 ? 's' : ''}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency(displayTotal)}
          </span>
        </div>
      )}
    </div>
  );
}
