'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Pencil, Trash2, X, Plus, Check, Search } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateCashBreakdown,
  extractCurrencyCode,
  extractAccountName,
  toSlug,
} from '@/services';
import { formatCurrency, formatNumber } from '@/lib/utils';
import CurrencyIcon from '@/components/ui/CurrencyIcon';
import { FIAT_CURRENCIES, FIAT_CURRENCY_MAP } from '@/lib/currencies';

interface PositionEntry {
  positionId: string;
  currency: string;
  amount: number;
  value: number;
  symbol: string;
  logo?: string;
}

interface AccountGroup {
  accountId: string;
  name: string;
  totalValue: number;
  entries: PositionEntry[];
}

function getInstitutionColor(name: string): string {
  const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

export default function CashAccountsPage() {
  const store = usePortfolioStore();
  const {
    positions,
    prices,
    customPrices,
    fxRates,
    hideBalances,
    addAccount,
    removeAccount,
    updateAccount,
    removePosition,
    updatePosition,
    addPosition,
    updatePrice,
  } = store;
  const cashAccounts = useMemo(() => store.cashAccounts(), [store.accounts]);
  const [includeStablecoins, setIncludeStablecoins] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [renamingAccountId, setRenamingAccountId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<string | null>(null);
  const [confirmDeletePositionId, setConfirmDeletePositionId] = useState<string | null>(null);
  const [addingCurrencyToAccountId, setAddingCurrencyToAccountId] = useState<string | null>(null);
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [newCurrencyBalance, setNewCurrencyBalance] = useState('');
  const [currencyPickerSearch, setCurrencyPickerSearch] = useState('');
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [addingNewAccount, setAddingNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');

  const allPositions = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates]);

  const breakdownData = useMemo(() => {
    return calculateCashBreakdown(allPositions, true);
  }, [allPositions]);

  const cashPositions = useMemo(() => {
    if (includeStablecoins) {
      return [...breakdownData.fiatPositions, ...breakdownData.stablecoinPositions];
    }
    return breakdownData.fiatPositions;
  }, [breakdownData, includeStablecoins]);

  const displayTotal = useMemo(() => {
    if (includeStablecoins) {
      return breakdownData.total;
    }
    return breakdownData.fiat.value;
  }, [breakdownData, includeStablecoins]);

  // Group positions by cash account
  const accountGroups = useMemo((): AccountGroup[] => {
    const groups: AccountGroup[] = [];
    const orphanGroup: AccountGroup = { accountId: '', name: 'Unlinked', totalValue: 0, entries: [] };

    // Create groups from cashAccounts
    const accountMap = new Map<string, AccountGroup>();
    cashAccounts.forEach((a) => {
      const group: AccountGroup = { accountId: a.id, name: a.name, totalValue: 0, entries: [] };
      accountMap.set(a.id, group);
    });

    cashPositions.forEach((p) => {
      const currency = extractCurrencyCode(p.symbol);
      const entry: PositionEntry = {
        positionId: p.id,
        currency,
        amount: p.amount,
        value: p.value,
        symbol: p.symbol,
        logo: p.logo,
      };

      if (p.accountId) {
        const group = accountMap.get(p.accountId);
        if (group) {
          group.totalValue += p.value;
          group.entries.push(entry);
        } else {
          orphanGroup.totalValue += p.value;
          orphanGroup.entries.push(entry);
        }
      } else {
        // Legacy position without accountId — match by slug
        const accountName = extractAccountName(p);
        const matchingAccount = cashAccounts.find(
          (a) => a.slug === toSlug(accountName)
        );
        if (matchingAccount) {
          const group = accountMap.get(matchingAccount.id)!;
          group.totalValue += p.value;
          group.entries.push(entry);
        } else {
          orphanGroup.totalValue += p.value;
          orphanGroup.entries.push(entry);
        }
      }
    });

    // Sort entries within each group by value desc
    for (const group of accountMap.values()) {
      group.entries.sort((a, b) => b.value - a.value);
      groups.push(group);
    }

    // Sort groups by total value desc
    groups.sort((a, b) => b.totalValue - a.totalValue);

    // Add orphan group at end if it has entries
    if (orphanGroup.entries.length > 0) {
      orphanGroup.entries.sort((a, b) => b.value - a.value);
      groups.push(orphanGroup);
    }

    return groups;
  }, [cashPositions, cashAccounts]);

  const uniqueAccountCount = accountGroups.filter((g) => g.entries.length > 0).length;

  const startEditBalance = (entry: PositionEntry) => {
    clearEditModes();
    setEditingPositionId(entry.positionId);
    setEditBalance(String(entry.amount));
  };

  const saveEditBalance = () => {
    if (editingPositionId && editBalance) {
      const newAmount = parseFloat(editBalance);
      if (!isNaN(newAmount) && newAmount >= 0) {
        updatePosition(editingPositionId, { amount: newAmount, costBasis: newAmount });
      }
    }
    setEditingPositionId(null);
    setEditBalance('');
  };

  const startRenameAccount = (accountId: string, currentName: string) => {
    clearEditModes();
    setRenamingAccountId(accountId);
    setRenameValue(currentName);
  };

  const saveRenameAccount = () => {
    if (renamingAccountId && renameValue.trim()) {
      updateAccount(renamingAccountId, { name: renameValue.trim() });
      // Also update position names that reference this account
      const account = cashAccounts.find((a) => a.id === renamingAccountId);
      if (account) {
        positions
          .filter((p) => p.accountId === renamingAccountId)
          .forEach((p) => {
            const currency = extractCurrencyCode(p.symbol);
            updatePosition(p.id, { name: `${renameValue.trim()} (${currency})` });
          });
      }
    }
    setRenamingAccountId(null);
    setRenameValue('');
  };

  const handleDeleteAccount = (accountId: string) => {
    removeAccount(accountId);
    setConfirmDeleteAccountId(null);
  };

  const handleDeletePosition = (positionId: string) => {
    removePosition(positionId);
    setConfirmDeletePositionId(null);
  };

  const handleAddCurrency = (accountId: string) => {
    if (!newCurrencyCode || !newCurrencyBalance) return;
    const account = cashAccounts.find((a) => a.id === accountId);
    if (!account) return;

    const uniqueId = crypto.randomUUID().slice(0, 8);
    const symbol = `CASH_${newCurrencyCode}_${uniqueId}`;
    addPosition({
      assetClass: 'cash',
      type: 'cash',
      symbol,
      name: `${account.name} (${newCurrencyCode})`,
      amount: parseFloat(newCurrencyBalance),
      costBasis: parseFloat(newCurrencyBalance),
      accountId: accountId,
    });

    updatePrice(symbol.toLowerCase(), {
      symbol: newCurrencyCode,
      price: 1,
      change24h: 0,
      changePercent24h: 0,
      lastUpdated: new Date().toISOString(),
    });

    setAddingCurrencyToAccountId(null);
    setNewCurrencyCode('');
    setNewCurrencyBalance('');
    setCurrencyPickerSearch('');
    setIsCurrencyPickerOpen(false);
  };

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) return;
    addAccount({ name: newAccountName.trim(), isActive: true, connection: { dataSource: 'manual' }, slug: toSlug(newAccountName.trim()) });
    setAddingNewAccount(false);
    setNewAccountName('');
  };

  // Clear other edit modes when starting a new one
  const clearEditModes = () => {
    setEditingPositionId(null);
    setEditBalance('');
    setRenamingAccountId(null);
    setRenameValue('');
    setConfirmDeleteAccountId(null);
    setConfirmDeletePositionId(null);
    setAddingCurrencyToAccountId(null);
    setNewCurrencyCode('');
    setNewCurrencyBalance('');
    setCurrencyPickerSearch('');
    setIsCurrencyPickerOpen(false);
  };

  const filteredPickerCurrencies = useMemo(() => {
    if (!addingCurrencyToAccountId) return [];
    const group = accountGroups.find((g) => g.accountId === addingCurrencyToAccountId);
    const held = group ? new Set(group.entries.map((e) => e.currency)) : new Set<string>();
    const query = currencyPickerSearch.toLowerCase();
    return FIAT_CURRENCIES.filter(
      (c) =>
        !held.has(c.code) &&
        (c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query))
    );
  }, [addingCurrencyToAccountId, currencyPickerSearch, accountGroups]);

  if (breakdownData.fiatPositions.length === 0 && breakdownData.stablecoinPositions.length === 0 && cashAccounts.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-[15px] font-semibold mb-2">No cash accounts</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md">
            Add cash positions to see your accounts grouped by institution.
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
            CASH ACCOUNTS
          </p>
          <h2 className="text-2xl font-semibold mb-1">
            {hideBalances ? '••••••••' : formatCurrency(displayTotal)}
          </h2>
          <p className="text-[13px] text-[var(--foreground-muted)]">
            {uniqueAccountCount} account{uniqueAccountCount !== 1 ? 's' : ''}
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIncludeStablecoins(!includeStablecoins)}
              className={`btn p-2 ${includeStablecoins ? 'btn-primary' : 'btn-secondary'}`}
            >
              <span className="text-xs">Include Stablecoins</span>
            </button>
            <button
              onClick={() => setAddingNewAccount(true)}
              className="btn btn-primary p-2"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add new account form */}
      {addingNewAccount && (
        <div className="mb-6 p-4 border border-[var(--border)] bg-[var(--card-bg)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">New Account</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Account name (e.g., N26, Wise)"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAccount(); if (e.key === 'Escape') setAddingNewAccount(false); }}
              className="form-input flex-1"
              autoFocus
            />
            <button
              onClick={handleCreateAccount}
              disabled={!newAccountName.trim()}
              className="btn btn-primary"
            >
              Create
            </button>
            <button
              onClick={() => { setAddingNewAccount(false); setNewAccountName(''); }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <hr className="border-[var(--border)] mb-6" />

      {/* Account Cards */}
      <div className="space-y-4">
        {accountGroups.map((group) => {
          if (group.entries.length === 0 && !group.accountId) return null;
          const positionCount = group.entries.length;
          const isOrphan = !group.accountId;

          return (
            <div key={group.accountId || 'orphan'} className="border-b border-[var(--border)] last:border-0 pb-6 mb-6 last:pb-0 last:mb-0">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-white text-[13px] font-semibold"
                    style={{ backgroundColor: getInstitutionColor(group.name) }}
                  >
                    {group.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    {renamingAccountId === group.accountId ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRenameAccount(); if (e.key === 'Escape') setRenamingAccountId(null); }}
                          className="form-input text-[13px] py-0.5 px-1 w-32"
                          autoFocus
                        />
                        <button onClick={saveRenameAccount} className="p-0.5 hover:bg-[var(--background-secondary)] transition-colors">
                          <Check className="w-3 h-3 text-[var(--positive)]" />
                        </button>
                        <button onClick={() => setRenamingAccountId(null)} className="p-0.5 hover:bg-[var(--background-secondary)] transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-[13px] font-medium">{group.name}</h3>
                    )}
                    <p className="text-[11px] text-[var(--foreground-muted)]">Cash Account</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[13px] font-semibold">
                      {hideBalances ? '••••' : formatCurrency(group.totalValue)}
                    </p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">
                      {positionCount} position{positionCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {!isOrphan && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startRenameAccount(group.accountId, group.name)}
                        className="p-1.5 hover:bg-[var(--background-secondary)] transition-colors"
                        title="Rename account"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                      </button>
                      {confirmDeleteAccountId === group.accountId ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteAccount(group.accountId)}
                            className="px-2 py-1 text-[11px] bg-[var(--negative)] text-white transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAccountId(null)}
                            className="px-2 py-1 text-[11px] bg-[var(--tag-bg)] text-[var(--tag-text)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteAccountId(group.accountId)}
                          className="p-1.5 hover:bg-[var(--background-secondary)] transition-colors"
                          title="Delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Positions Table */}
              <div className="border-t border-[var(--border)] pt-4">
                <div className="table-scroll">
                  <table className="w-full min-w-[400px]">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="table-header text-left pb-3">Currency</th>
                        <th className="table-header text-right pb-3">Amount</th>
                        <th className="table-header text-right pb-3">Value</th>
                        <th className="table-header text-right pb-3">% of Account</th>
                        <th className="table-header text-right pb-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry) => {
                        const pct = group.totalValue > 0 ? (entry.value / group.totalValue) * 100 : 0;
                        return (
                          <tr
                            key={entry.positionId}
                            className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors"
                          >
                            <td className="py-2">
                              <Link
                                href={`/cash/currency/${extractCurrencyCode(entry.symbol).toLowerCase()}`}
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                              >
                                <CurrencyIcon symbol={entry.currency} size={20} logoUrl={entry.logo} />
                                <span className="text-sm font-medium">{entry.currency}</span>
                              </Link>
                            </td>
                            <td className="py-2 text-right font-mono text-xs">
                              {editingPositionId === entry.positionId ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={editBalance}
                                  onChange={(e) => setEditBalance(e.target.value)}
                                  onBlur={saveEditBalance}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditBalance(); if (e.key === 'Escape') setEditingPositionId(null); }}
                                  className="form-input w-24 text-right text-xs py-0.5 px-1"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="cursor-pointer hover:text-[var(--accent-primary)] transition-colors"
                                  onClick={() => startEditBalance(entry)}
                                  title="Click to edit"
                                >
                                  {hideBalances ? '••••' : formatNumber(entry.amount)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right font-semibold text-sm">
                              {hideBalances ? '••••' : formatCurrency(entry.value)}
                            </td>
                            <td className="py-2 text-right text-xs text-[var(--foreground-muted)]">
                              {pct.toFixed(1)}%
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => startEditBalance(entry)}
                                  className="p-1 hover:bg-[var(--background-tertiary)] transition-colors"
                                  title="Edit balance"
                                >
                                  <Pencil className="w-3 h-3 text-[var(--foreground-muted)]" />
                                </button>
                                {confirmDeletePositionId === entry.positionId ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDeletePosition(entry.positionId)}
                                      className="px-1.5 py-0.5 text-[10px] bg-[var(--negative)] text-white transition-colors"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeletePositionId(null)}
                                      className="px-1.5 py-0.5 text-[10px] bg-[var(--tag-bg)] text-[var(--tag-text)] transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeletePositionId(entry.positionId)}
                                    className="p-1 hover:bg-[var(--background-tertiary)] transition-colors"
                                    title="Remove currency"
                                  >
                                    <X className="w-3 h-3 text-[var(--foreground-muted)]" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add currency to account */}
                {!isOrphan && (
                  <div className="mt-3">
                    {addingCurrencyToAccountId === group.accountId ? (
                      <div className="flex items-end gap-2">
                        {/* Currency picker */}
                        <div className="flex-1 relative">
                          <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Currency</label>
                          <button
                            type="button"
                            onClick={() => setIsCurrencyPickerOpen(!isCurrencyPickerOpen)}
                            className="form-input w-full text-left flex items-center gap-2 text-sm py-1.5"
                          >
                            {newCurrencyCode ? (
                              <>
                                <span>{FIAT_CURRENCY_MAP[newCurrencyCode]?.flag}</span>
                                <span className="font-medium">{newCurrencyCode}</span>
                              </>
                            ) : (
                              <span className="text-[var(--foreground-muted)]">Select...</span>
                            )}
                          </button>
                          {isCurrencyPickerOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--border)] bg-[var(--card-bg)] z-10">
                              <div className="relative p-1.5 border-b border-[var(--border)]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)]" />
                                <input
                                  type="text"
                                  placeholder="Search..."
                                  value={currencyPickerSearch}
                                  onChange={(e) => setCurrencyPickerSearch(e.target.value)}
                                  className="form-input w-full pl-7 text-xs py-1"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-36 overflow-y-auto">
                                {filteredPickerCurrencies.map((c) => (
                                  <button
                                    key={c.code}
                                    type="button"
                                    onClick={() => {
                                      setNewCurrencyCode(c.code);
                                      setIsCurrencyPickerOpen(false);
                                      setCurrencyPickerSearch('');
                                    }}
                                    className="w-full px-2 py-1.5 text-left hover:bg-[var(--background-secondary)] flex items-center gap-2 transition-colors text-xs"
                                  >
                                    <span>{c.flag}</span>
                                    <span className="font-medium">{c.code}</span>
                                    <span className="text-[var(--foreground-muted)] flex-1">{c.name}</span>
                                  </button>
                                ))}
                                {filteredPickerCurrencies.length === 0 && (
                                  <p className="px-2 py-1.5 text-[11px] text-[var(--foreground-muted)]">No currencies available</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Balance input */}
                        <div className="w-28">
                          <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Balance</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={newCurrencyBalance}
                            onChange={(e) => setNewCurrencyBalance(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCurrency(group.accountId); }}
                            className="form-input w-full text-sm py-1.5"
                          />
                        </div>
                        <button
                          onClick={() => handleAddCurrency(group.accountId)}
                          disabled={!newCurrencyCode || !newCurrencyBalance}
                          className="btn btn-primary py-1.5 px-3 text-xs"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setAddingCurrencyToAccountId(null);
                            setNewCurrencyCode('');
                            setNewCurrencyBalance('');
                            setCurrencyPickerSearch('');
                            setIsCurrencyPickerOpen(false);
                          }}
                          className="btn btn-secondary py-1.5 px-3 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingCurrencyToAccountId(group.accountId)}
                        className="flex items-center gap-1 text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add currency
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty accounts (no positions yet) */}
        {cashAccounts
          .filter((a) => !accountGroups.some((g) => g.accountId === a.id && g.entries.length > 0))
          .map((a) => (
            <div key={a.id} className="border-b border-[var(--border)] last:border-0 pb-6 mb-6 last:pb-0 last:mb-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-white text-[13px] font-semibold"
                    style={{ backgroundColor: getInstitutionColor(a.name) }}
                  >
                    {a.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-[13px] font-medium">{a.name}</h3>
                    <p className="text-[11px] text-[var(--foreground-muted)]">No positions</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startRenameAccount(a.id, a.name)}
                    className="p-1.5 hover:bg-[var(--background-secondary)] transition-colors"
                    title="Rename account"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                  </button>
                  {confirmDeleteAccountId === a.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteAccount(a.id)}
                        className="px-2 py-1 text-[11px] bg-[var(--negative)] text-white transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAccountId(null)}
                        className="px-2 py-1 text-[11px] bg-[var(--tag-bg)] text-[var(--tag-text)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteAccountId(a.id)}
                      className="p-1.5 hover:bg-[var(--background-secondary)] transition-colors"
                      title="Delete account"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Add currency inline */}
              {addingCurrencyToAccountId === a.id ? (
                <div className="flex items-end gap-2 mt-3">
                  <div className="flex-1 relative">
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Currency</label>
                    <button
                      type="button"
                      onClick={() => setIsCurrencyPickerOpen(!isCurrencyPickerOpen)}
                      className="form-input w-full text-left flex items-center gap-2 text-sm py-1.5"
                    >
                      {newCurrencyCode ? (
                        <>
                          <span>{FIAT_CURRENCY_MAP[newCurrencyCode]?.flag}</span>
                          <span className="font-medium">{newCurrencyCode}</span>
                        </>
                      ) : (
                        <span className="text-[var(--foreground-muted)]">Select...</span>
                      )}
                    </button>
                    {isCurrencyPickerOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 border border-[var(--border)] bg-[var(--card-bg)] z-10">
                        <div className="relative p-1.5 border-b border-[var(--border)]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)]" />
                          <input
                            type="text"
                            placeholder="Search..."
                            value={currencyPickerSearch}
                            onChange={(e) => setCurrencyPickerSearch(e.target.value)}
                            className="form-input w-full pl-7 text-xs py-1"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-36 overflow-y-auto">
                          {filteredPickerCurrencies.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setNewCurrencyCode(c.code);
                                setIsCurrencyPickerOpen(false);
                                setCurrencyPickerSearch('');
                              }}
                              className="w-full px-2 py-1.5 text-left hover:bg-[var(--background-secondary)] flex items-center gap-2 transition-colors text-xs"
                            >
                              <span>{c.flag}</span>
                              <span className="font-medium">{c.code}</span>
                              <span className="text-[var(--foreground-muted)] flex-1">{c.name}</span>
                            </button>
                          ))}
                          {filteredPickerCurrencies.length === 0 && (
                            <p className="px-2 py-1.5 text-[11px] text-[var(--foreground-muted)]">No currencies available</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">Balance</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={newCurrencyBalance}
                      onChange={(e) => setNewCurrencyBalance(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddCurrency(a.id); }}
                      className="form-input w-full text-sm py-1.5"
                    />
                  </div>
                  <button
                    onClick={() => handleAddCurrency(a.id)}
                    disabled={!newCurrencyCode || !newCurrencyBalance}
                    className="btn btn-primary py-1.5 px-3 text-xs"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setAddingCurrencyToAccountId(null);
                      setNewCurrencyCode('');
                      setNewCurrencyBalance('');
                      setCurrencyPickerSearch('');
                      setIsCurrencyPickerOpen(false);
                    }}
                    className="btn btn-secondary py-1.5 px-3 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCurrencyToAccountId(a.id)}
                  className="flex items-center gap-1 text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mt-3"
                >
                  <Plus className="w-3 h-3" />
                  Add currency
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
