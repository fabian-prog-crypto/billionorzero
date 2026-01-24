'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services';
import { fetchAllCexPositions } from '@/services/providers/cex-provider';
import Header from '@/components/Header';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { CexAccount, CexExchange } from '@/types';

const EXCHANGE_INFO: Record<CexExchange, { name: string; logo: string; supported: boolean }> = {
  binance: { name: 'Binance', logo: 'B', supported: true },
  coinbase: { name: 'Coinbase', logo: 'C', supported: false },
  kraken: { name: 'Kraken', logo: 'K', supported: false },
  okx: { name: 'OKX', logo: 'O', supported: false },
};

export default function AccountsPage() {
  const { accounts, positions, prices, addAccount, removeAccount, updateAccount, setAccountPositions, hideBalances, toggleHideBalances } = usePortfolioStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSyncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Calculate CEX positions with prices
  const cexPositions = useMemo(() => {
    const cexPositions = positions.filter((p) => p.protocol?.startsWith('cex:'));
    return calculateAllPositionsWithPrices(cexPositions, prices);
  }, [positions, prices]);

  // Group positions by account
  const positionsByAccount = useMemo(() => {
    const grouped: Record<string, typeof cexPositions> = {};
    cexPositions.forEach((p) => {
      const accountId = p.protocol?.split(':')[2];
      if (accountId) {
        if (!grouped[accountId]) grouped[accountId] = [];
        grouped[accountId].push(p);
      }
    });
    return grouped;
  }, [cexPositions]);

  // Calculate total CEX value
  const totalCexValue = useMemo(() => {
    return cexPositions.reduce((sum, p) => sum + p.value, 0);
  }, [cexPositions]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const newPositions = await fetchAllCexPositions(accounts);
      setAccountPositions(newPositions);
      // Update last sync time for all synced accounts
      accounts.forEach((account) => {
        if (account.isActive) {
          updateAccount(account.id, { lastSync: new Date().toISOString() });
        }
      });
    } catch (error) {
      console.error('Sync error:', error);
      setSyncError(error instanceof Error ? error.message : 'Failed to sync accounts');
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveAccount = (id: string) => {
    if (confirm('Are you sure you want to remove this account? All positions from this account will be removed.')) {
      removeAccount(id);
    }
  };

  return (
    <div>
      <Header title="CEX Accounts" onSync={handleSync} />

      {/* Summary Card */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--foreground-muted)] mb-1">Total CEX Holdings</p>
            <h2 className="text-3xl font-bold">{hideBalances ? '******' : formatCurrency(totalCexValue)}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
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
              onClick={handleSync}
              className="btn btn-secondary"
              disabled={isSyncing || accounts.length === 0}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync All
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
      </div>

      {syncError && (
        <div className="card mb-6 bg-[var(--negative-light)] border-[var(--negative)]">
          <div className="flex items-center gap-2 text-[var(--negative)]">
            <AlertCircle className="w-5 h-5" />
            <span>{syncError}</span>
          </div>
        </div>
      )}

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-2">No CEX accounts connected</p>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Connect your Binance account to automatically track your holdings.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const accountPositions = positionsByAccount[account.id] || [];
            const accountValue = accountPositions.reduce((sum, p) => sum + p.value, 0);
            const exchangeInfo = EXCHANGE_INFO[account.exchange];

            return (
              <div key={account.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[var(--accent-primary)] rounded-full flex items-center justify-center text-white font-semibold">
                      {exchangeInfo.logo}
                    </div>
                    <div>
                      <h3 className="font-semibold">{account.name}</h3>
                      <p className="text-sm text-[var(--foreground-muted)]">{exchangeInfo.name}</p>
                    </div>
                    {account.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--positive)]">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">{hideBalances ? '****' : formatCurrency(accountValue)}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {accountPositions.length} asset{accountPositions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveAccount(account.id)}
                      className="p-2 hover:bg-[var(--negative-light)] text-[var(--negative)] rounded-lg transition-colors"
                      title="Remove account"
                    >
                      <Trash2 className="w-4 h-4" />
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
                            <th className="table-header text-left pb-2">Asset</th>
                            <th className="table-header text-right pb-2">Amount</th>
                            <th className="table-header text-right pb-2">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountPositions
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 10)
                            .map((position) => (
                              <tr key={position.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                                      {position.symbol.slice(0, 1).toUpperCase()}
                                    </div>
                                    <span className="font-medium">{position.symbol.toUpperCase()}</span>
                                  </div>
                                </td>
                                <td className="py-2 text-right font-mono text-sm">
                                  {hideBalances ? '***' : formatNumber(position.amount)}
                                </td>
                                <td className="py-2 text-right font-semibold">
                                  {hideBalances ? '****' : formatCurrency(position.value)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {accountPositions.length > 10 && (
                      <p className="text-xs text-[var(--foreground-muted)] mt-2 text-center">
                        +{accountPositions.length - 10} more assets
                      </p>
                    )}
                  </div>
                )}

                {account.lastSync && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-3">
                    Last synced: {new Date(account.lastSync).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const { addAccount, accounts } = usePortfolioStore();
  const [exchange, setExchange] = useState<CexExchange>('binance');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a name for this account');
      return;
    }

    if (!apiKey.trim() || !apiSecret.trim()) {
      setError('Please enter both API Key and Secret');
      return;
    }

    // Check for duplicate name
    if (accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      setError('An account with this name already exists');
      return;
    }

    setIsSubmitting(true);

    try {
      // Test the credentials by fetching account info
      const response = await fetch('/api/cex/binance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          apiSecret,
          endpoint: 'account',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid API credentials');
      }

      // Credentials are valid, add the account
      addAccount({
        exchange,
        name: name.trim(),
        apiKey,
        apiSecret,
        isActive: true,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-4">Add CEX Account</h2>

        <form onSubmit={handleSubmit}>
          {/* Exchange selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Exchange</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(EXCHANGE_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => info.supported && setExchange(key as CexExchange)}
                  disabled={!info.supported}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    exchange === key
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] bg-opacity-10'
                      : info.supported
                      ? 'border-[var(--border)] hover:border-[var(--accent-primary)]'
                      : 'border-[var(--border)] opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
                      info.supported ? 'bg-[var(--accent-primary)]' : 'bg-gray-400'
                    }`}>
                      {info.logo}
                    </div>
                    <div>
                      <p className="font-medium">{info.name}</p>
                      {!info.supported && (
                        <p className="text-xs text-[var(--foreground-muted)]">Coming soon</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Account name */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Trading Account"
              className="w-full"
            />
          </div>

          {/* API Key */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full font-mono text-sm"
            />
          </div>

          {/* API Secret */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">API Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your API secret"
                className="w-full font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Security note */}
          <div className="mb-4 p-3 bg-[var(--background-secondary)] rounded-lg text-sm text-[var(--foreground-muted)]">
            <p className="font-medium mb-1">Security Note:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Use read-only API keys (no trading/withdrawal permissions)</li>
              <li>API keys are stored locally in your browser</li>
              <li>We never send your keys to any server except Binance</li>
            </ul>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[var(--negative-light)] rounded-lg text-[var(--negative)] text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Add Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
