'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, filterPositionsByAccountAndAssetClass } from '@/services';
import { formatCurrency, formatNumber } from '@/lib/utils';

export default function BrokerageAccountsPage() {
  const store = usePortfolioStore();
  const {
    positions,
    prices,
    customPrices,
    fxRates,
    addAccount,
    removeAccount,
    hideBalances,
    toggleHideBalances,
  } = store;
  const brokerageAccounts = store.brokerageAccounts();
  const [showAddModal, setShowAddModal] = useState(false);

  // Calculate brokerage positions with prices
  const brokerageAccountIds = useMemo(() => new Set(brokerageAccounts.map(a => a.id)), [brokerageAccounts]);
  const brokeragePositions = useMemo(() => {
    const filtered = filterPositionsByAccountAndAssetClass(positions, brokerageAccountIds, 'equity');
    return calculateAllPositionsWithPrices(filtered, prices, customPrices, fxRates);
  }, [positions, prices, customPrices, fxRates, brokerageAccountIds]);

  // Group positions by account
  const positionsByAccount = useMemo(() => {
    const grouped: Record<string, typeof brokeragePositions> = {};
    brokeragePositions.forEach((p) => {
      if (p.accountId) {
        if (!grouped[p.accountId]) grouped[p.accountId] = [];
        grouped[p.accountId].push(p);
      }
    });
    return grouped;
  }, [brokeragePositions]);

  // Calculate total brokerage value
  const totalBrokerageValue = useMemo(() => {
    return brokeragePositions.reduce((sum, p) => sum + p.value, 0);
  }, [brokeragePositions]);

  const handleRemoveAccount = (id: string) => {
    if (confirm('Are you sure you want to remove this account? All positions from this account will be removed.')) {
      removeAccount(id);
    }
  };

  return (
    <div>
      {/* Summary */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">TOTAL BROKERAGE HOLDINGS</p>
          <h2 className="text-2xl font-semibold">{hideBalances ? '••••••••' : formatCurrency(totalBrokerageValue)}</h2>
          <p className="text-[13px] text-[var(--foreground-muted)] mt-1">
            {brokerageAccounts.length} account{brokerageAccounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleHideBalances}
            className="btn btn-secondary"
            title={hideBalances ? 'Show balances' : 'Hide balances'}
          >
            {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Accounts List */}
      {brokerageAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 bg-[var(--background-secondary)] flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <p className="text-[15px] font-semibold mb-2">No brokerage accounts</p>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4 text-center">
            Add a brokerage account to organize your equity positions.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {brokerageAccounts.map((account) => {
            const accountPositions = positionsByAccount[account.id] || [];
            const accountValue = accountPositions.reduce((sum, p) => sum + p.value, 0);

            return (
              <div key={account.id} className="border-b border-[var(--border)] last:border-0 pb-6 mb-6 last:pb-0 last:mb-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[var(--accent-primary)] flex items-center justify-center text-white text-[13px] font-semibold">
                      {account.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[13px] font-medium">{account.name}</h3>
                      <p className="text-[11px] text-[var(--foreground-muted)]">Brokerage</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[13px] font-semibold">{hideBalances ? '••••' : formatCurrency(accountValue)}</p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">
                        {accountPositions.length} asset{accountPositions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveAccount(account.id)}
                      className="p-1.5 hover:bg-[var(--negative-light)] text-[var(--negative)] transition-colors"
                      title="Remove account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Account positions */}
                {accountPositions.length > 0 && (
                  <div className="border-t border-[var(--border)] pt-4">
                    <div className="table-scroll">
                      <table className="w-full min-w-[400px]">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="table-header text-left pb-3">Asset</th>
                            <th className="table-header text-right pb-3">Amount</th>
                            <th className="table-header text-right pb-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountPositions
                            .sort((a, b) => b.value - a.value)
                            .map((position) => (
                              <tr key={position.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-[var(--tag-bg)] flex items-center justify-center text-xs font-semibold">
                                      {position.symbol.slice(0, 1).toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="font-medium">{position.symbol.toUpperCase()}</span>
                                      {position.type === 'cash' && (
                                        <span className="ml-1 text-[10px] text-[var(--foreground-muted)]">Cash</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 text-right font-mono text-sm">
                                  {hideBalances ? '***' : position.type === 'cash' ? formatCurrency(position.amount) : formatNumber(position.amount)}
                                </td>
                                <td className="py-2 text-right font-semibold">
                                  {hideBalances ? '****' : formatCurrency(position.value)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddBrokerageAccountModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function AddBrokerageAccountModal({ onClose }: { onClose: () => void }) {
  const brokerageStore = usePortfolioStore();
  const { addAccount } = brokerageStore;
  const brokerageAccounts = brokerageStore.brokerageAccounts();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a name for this account');
      return;
    }

    if (brokerageAccounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      setError('An account with this name already exists');
      return;
    }

    addAccount({
      name: name.trim(),
      isActive: true,
      connection: { dataSource: 'manual' },
    });

    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Add Brokerage Account</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Revolut, IBKR Main"
              className="w-full"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[var(--negative-light)] text-[var(--negative)] text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
