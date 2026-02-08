'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Banknote } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCashBreakdown,
  extractCurrencyCode,
  extractAccountName,
} from '@/services';
import { FIAT_CURRENCY_MAP } from '@/lib/currencies';
import CurrencyIcon from '@/components/ui/CurrencyIcon';
import SearchInput from '@/components/ui/SearchInput';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface AccountGroup {
  key: string;
  accountName: string;
  amount: number;
  value: number;
  positions: ReturnType<typeof calculateAllPositionsWithPrices>;
}

export default function CashCurrencyDetailPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const [searchQuery, setSearchQuery] = useState('');

  const { positions, prices, customPrices, fxRates, hideBalances, cashAccounts } = usePortfolioStore();

  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const breakdownData = useMemo(() => {
    return calculateCashBreakdown(allPositions, true);
  }, [allPositions]);

  // Filter to positions matching this currency code
  const currencyPositions = useMemo(() => {
    return breakdownData.fiatPositions.filter(
      (p) => extractCurrencyCode(p.symbol) === code
    );
  }, [breakdownData.fiatPositions, code]);

  // Currency metadata
  const currencyInfo = FIAT_CURRENCY_MAP[code];
  const currencyName = currencyInfo?.name || code;
  const currencyFlag = currencyInfo?.flag || '';

  // Totals
  const totalValue = useMemo(() => {
    return currencyPositions.reduce((sum, p) => sum + p.value, 0);
  }, [currencyPositions]);

  const totalAmount = useMemo(() => {
    return currencyPositions.reduce((sum, p) => sum + p.amount, 0);
  }, [currencyPositions]);

  // FX rate from the first position's currentPrice (already set by calculatePositionValue)
  const fxRate = currencyPositions.length > 0 ? currencyPositions[0].currentPrice : 1;

  // Portfolio allocation
  const totalAllocation = useMemo(() => {
    return currencyPositions.reduce((sum, p) => sum + p.allocation, 0);
  }, [currencyPositions]);

  // Group by account
  const accountGroups = useMemo((): AccountGroup[] => {
    const groupMap = new Map<string, AccountGroup>();

    currencyPositions.forEach((p) => {
      // Try to resolve account name from cash-account protocol
      let accountName = 'Unknown';
      const protocol = p.protocol || '';
      const cashAccountMatch = protocol.match(/^cash-account:(.+)$/);
      if (cashAccountMatch) {
        const accountId = cashAccountMatch[1];
        const account = cashAccounts.find((a) => a.id === accountId);
        accountName = account?.name || extractAccountName(p);
      } else {
        accountName = extractAccountName(p);
      }

      const key = accountName.toLowerCase();
      const existing = groupMap.get(key);
      if (existing) {
        existing.amount += p.amount;
        existing.value += p.value;
        existing.positions.push(p);
      } else {
        groupMap.set(key, {
          key,
          accountName,
          amount: p.amount,
          value: p.value,
          positions: [p],
        });
      }
    });

    return Array.from(groupMap.values()).sort((a, b) => b.value - a.value);
  }, [currencyPositions, cashAccounts]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return accountGroups;
    const query = searchQuery.toLowerCase();
    return accountGroups.filter((g) => g.accountName.toLowerCase().includes(query));
  }, [accountGroups, searchQuery]);

  const filteredTotal = useMemo(() => {
    return filteredGroups.reduce((sum, g) => sum + g.value, 0);
  }, [filteredGroups]);

  // Empty state: invalid currency code or no positions
  if (currencyPositions.length === 0) {
    return (
      <div>
        <Link
          href="/cash/positions"
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cash
        </Link>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Banknote className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No {code} positions found</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            There are no cash positions in {currencyName} ({code}).
          </p>
          <Link
            href="/cash/positions"
            className="btn btn-primary mt-4"
          >
            Back to Cash
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <Link
        href="/cash/positions"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Cash
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <CurrencyIcon symbol={code} size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{currencyFlag} {code}</h1>
              <span className="text-[var(--foreground-muted)]">&middot;</span>
              <span className="text-[var(--foreground-muted)] text-sm">{currencyName}</span>
            </div>
            <p className="text-[13px] text-[var(--foreground-muted)]">
              1 {code} = {formatCurrency(fxRate)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold">
            {hideBalances ? '••••••••' : formatCurrency(totalValue)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">
            {(totalAllocation * 100).toFixed(1)}% of portfolio
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Holdings</p>
          <p className="text-xl font-semibold">
            {hideBalances ? '••••' : formatNumber(totalAmount)}
          </p>
          <p className="text-xs text-[var(--foreground-muted)]">{code}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">FX Rate</p>
          <p className="text-xl font-semibold">{formatCurrency(fxRate)}</p>
          <p className="text-xs text-[var(--foreground-muted)]">per {code}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Accounts</p>
          <p className="text-xl font-semibold">{accountGroups.length}</p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Holdings header + search */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-[15px]">
          Holdings ({filteredGroups.length} of {accountGroups.length})
        </h3>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search accounts..."
        />
      </div>

      {/* Holdings table */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[var(--foreground-muted)]">No accounts match your search.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Account</th>
                <th className="table-header text-right pb-3">Amount</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((group) => {
                const pct = totalValue > 0 ? (group.value / totalValue) * 100 : 0;
                return (
                  <tr
                    key={group.key}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <td className="py-2">
                      <p className="font-medium text-sm">{group.accountName}</p>
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {hideBalances ? '••••' : formatNumber(group.amount)}
                    </td>
                    <td className="py-2 text-right font-semibold text-sm">
                      {hideBalances ? '••••' : formatCurrency(group.value)}
                    </td>
                    <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {filteredGroups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[12px] text-[var(--foreground-muted)]">
            {filteredGroups.length} account{filteredGroups.length !== 1 ? 's' : ''}
            {searchQuery && ' (filtered)'}
          </span>
          <span className="font-semibold">
            {hideBalances ? '••••••' : formatCurrency(searchQuery ? filteredTotal : totalValue)}
          </span>
        </div>
      )}
    </div>
  );
}
