'use client';

import { useMemo, useState } from 'react';
import { Banknote, ArrowUpDown, ChevronDown, ChevronUp, Wallet, Building2, ToggleLeft, ToggleRight } from 'lucide-react';
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

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
  return sortDirection === 'asc' ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}

// Currency display names
const CURRENCY_NAMES: Record<string, string> = {
  usd: 'US Dollar',
  eur: 'Euro',
  gbp: 'British Pound',
  chf: 'Swiss Franc',
  jpy: 'Japanese Yen',
  cny: 'Chinese Yuan',
  cad: 'Canadian Dollar',
  aud: 'Australian Dollar',
  nzd: 'New Zealand Dollar',
  hkd: 'Hong Kong Dollar',
  sgd: 'Singapore Dollar',
  sek: 'Swedish Krona',
  nok: 'Norwegian Krone',
  dkk: 'Danish Krone',
  krw: 'South Korean Won',
  inr: 'Indian Rupee',
  brl: 'Brazilian Real',
  mxn: 'Mexican Peso',
  zar: 'South African Rand',
  aed: 'UAE Dirham',
  thb: 'Thai Baht',
  pln: 'Polish Zloty',
  czk: 'Czech Koruna',
  ils: 'Israeli Shekel',
  php: 'Philippine Peso',
  idr: 'Indonesian Rupiah',
  myr: 'Malaysian Ringgit',
  try: 'Turkish Lira',
  rub: 'Russian Ruble',
  // Stablecoins
  usdt: 'Tether USD',
  usdc: 'USD Coin',
  dai: 'Dai',
  busd: 'Binance USD',
  tusd: 'TrueUSD',
  frax: 'Frax',
  lusd: 'Liquity USD',
  usdd: 'USDD',
  gusd: 'Gemini Dollar',
  usdp: 'Pax Dollar',
  pyusd: 'PayPal USD',
  eurs: 'STASIS Euro',
  eurc: 'Euro Coin',
  usde: 'Ethena USDe',
  susde: 'Staked USDe',
  gho: 'GHO',
  crvusd: 'Curve USD',
};

// Get clean display name for position
function getPositionDisplayName(position: { symbol: string; name: string; walletAddress?: string; protocol?: string; chain?: string }): string {
  const symbol = position.symbol.toLowerCase();

  // If it has a protocol, show protocol name
  if (position.protocol) {
    return position.protocol;
  }

  // If from a wallet, show chain
  if (position.walletAddress && position.chain) {
    const chainName = position.chain.charAt(0).toUpperCase() + position.chain.slice(1);
    return chainName;
  }

  // For manual entries, show clean currency name or "Bank Account"
  const currencyName = CURRENCY_NAMES[symbol];
  if (currencyName) {
    return position.walletAddress ? currencyName : 'Bank Account';
  }

  // Default to "Cash" for unrecognized manual entries
  return position.walletAddress ? 'Wallet' : 'Cash';
}

export default function CashPage() {
  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeStablecoins, setIncludeStablecoins] = useState(true);

  // Calculate all positions with prices
  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

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

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let filtered = cashPositions;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.symbol.toLowerCase().includes(query) ||
          CURRENCY_NAMES[p.symbol.toLowerCase()]?.toLowerCase().includes(query)
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
            {includeStablecoins ? 'TOTAL CASH & EQUIVALENTS' : 'FIAT CASH'}
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

      {/* Stablecoin Toggle */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setIncludeStablecoins(!includeStablecoins)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] transition-colors"
        >
          {includeStablecoins ? (
            <ToggleRight className="w-5 h-5 text-[var(--accent-primary)]" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-[var(--foreground-muted)]" />
          )}
          <span className="text-[13px] font-medium">Include Stablecoins</span>
        </button>
      </div>

      {/* Pie Chart and Summary */}
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
              <div className="w-8 h-8 rounded-lg bg-[#4CAF50]/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-[#4CAF50]" />
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
                <span> · {((breakdownData.fiat.value / breakdownData.total) * 100).toFixed(0)}%</span>
              )}
            </div>
          </div>

          {/* Stablecoin Summary */}
          <div className="p-4 rounded-xl bg-[var(--background-secondary)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[#2775CA]/20 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-[#2775CA]" />
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
                <span> · {((breakdownData.stablecoins.value / breakdownData.total) * 100).toFixed(0)}%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Search */}
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
              const currencyName = CURRENCY_NAMES[position.symbol.toLowerCase()] || position.symbol.toUpperCase();

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
                        <p className="text-[11px] text-[var(--foreground-muted)]">
                          {currencyName}
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
                        {position.protocol && (
                          <span className="tag text-[9px] py-0.5 px-1 bg-[var(--accent-primary)] text-white">
                            {position.protocol}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-[var(--foreground-muted)]" />
                        <span className="text-[11px] text-[var(--foreground-muted)]">
                          Bank Account
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
