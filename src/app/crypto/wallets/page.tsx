'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Wallet, ExternalLink, Copy, Check, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary } from '@/services';
import AddWalletModal from '@/components/modals/AddWalletModal';
import { formatAddress, formatCurrency } from '@/lib/utils';
import { SUPPORTED_CHAINS, getPerpExchangeName } from '@/services';

type SortField = 'name' | 'assets' | 'value';
type SortDirection = 'asc' | 'desc';

export default function WalletsPage() {
  const router = useRouter();
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { wallets, positions, prices, removeWallet, hideBalances } = usePortfolioStore();

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this wallet? All associated positions will be removed.')) {
      removeWallet(id);
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Get positions for a wallet
  const getWalletPositions = (address: string) => {
    return positions.filter((p) => p.walletAddress === address);
  };

  // Get wallet value - using centralized service
  const getWalletValue = (address: string) => {
    const walletPositions = getWalletPositions(address);
    const summary = calculatePortfolioSummary(walletPositions, prices);
    return summary.totalValue;
  };

  // Get chain name
  const getChainName = (chainId: string) => {
    return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name || chainId.toUpperCase();
  };

  // Get unique chains from wallet positions (auto-detected by DeBank)
  const getWalletChains = (address: string) => {
    const walletPositions = getWalletPositions(address);
    const chains = [...new Set(walletPositions.map(p => p.chain).filter(Boolean))] as string[];
    return chains.sort();
  };

  const handleRowClick = (walletId: string) => {
    router.push(`/wallets/${walletId}`);
  };

  // Sort wallets
  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'assets':
          comparison = getWalletPositions(a.address).length - getWalletPositions(b.address).length;
          break;
        case 'value':
          comparison = getWalletValue(a.address) - getWalletValue(b.address);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [wallets, positions, prices, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3" />
      : <ArrowDown className="w-3 h-3" />;
  };

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--foreground-muted)]">
          {wallets.length} wallet{wallets.length !== 1 ? 's' : ''} connected
        </p>
        <button
          onClick={() => setShowAddWallet(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Wallet
        </button>
      </div>

      {wallets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 bg-[var(--background-secondary)]  flex items-center justify-center mb-4">
            <Wallet className="w-6 h-6 text-[var(--foreground-muted)]" />
          </div>
          <h3 className="text-[15px] font-semibold mb-2">No wallets connected</h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4 text-center max-w-md">
            Connect a wallet to automatically track your crypto holdings across multiple chains.
          </p>
          <button
            onClick={() => setShowAddWallet(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Connect Wallet
          </button>
        </div>
      ) : (
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors"
                  >
                    Name
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="table-header text-left pb-3">Address</th>
                <th className="table-header text-left pb-3">Networks</th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => handleSort('assets')}
                    className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                  >
                    Assets
                    <SortIcon field="assets" />
                  </button>
                </th>
                <th className="table-header text-right pb-3">
                  <button
                    onClick={() => handleSort('value')}
                    className="flex items-center gap-1 ml-auto hover:text-[var(--foreground)] transition-colors"
                  >
                    Value
                    <SortIcon field="value" />
                  </button>
                </th>
                <th className="table-header text-right pb-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sortedWallets.map((wallet) => {
                const walletPositions = getWalletPositions(wallet.address);
                const walletValue = getWalletValue(wallet.address);

                return (
                  <tr
                    key={wallet.id}
                    onClick={() => handleRowClick(wallet.id)}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors cursor-pointer"
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[var(--tag-bg)]  flex items-center justify-center">
                          <Wallet className="w-3 h-3 text-[var(--foreground-muted)]" />
                        </div>
                        <span className="text-[13px] font-medium">{wallet.name}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] text-[var(--foreground-muted)] font-mono">
                          {formatAddress(wallet.address, 8)}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyAddress(wallet.address);
                          }}
                          className="p-1 hover:bg-[var(--border)] "
                        >
                          {copiedAddress === wallet.address ? (
                            <Check className="w-2.5 h-2.5 text-[var(--positive)]" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-[var(--foreground-muted)]" />
                          )}
                        </button>
                        <a
                          href={`https://etherscan.io/address/${wallet.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 hover:bg-[var(--border)] "
                        >
                          <ExternalLink className="w-2.5 h-2.5 text-[var(--foreground-muted)]" />
                        </a>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1 flex-wrap">
                        {(() => {
                          const detectedChains = getWalletChains(wallet.address);
                          const perpExchanges = wallet.perpExchanges || [];
                          if (detectedChains.length === 0 && perpExchanges.length === 0) {
                            return <span className="text-[10px] text-[var(--foreground-muted)]">Syncing...</span>;
                          }
                          return (
                            <>
                              {detectedChains.slice(0, 3).map((chain) => (
                                <span key={chain} className="text-[10px] px-1 py-0  bg-[var(--tag-bg)] text-[var(--foreground-muted)]">
                                  {getChainName(chain)}
                                </span>
                              ))}
                              {detectedChains.length > 3 && (
                                <span className="text-[10px] px-1 py-0  bg-[var(--tag-bg)] text-[var(--foreground-muted)]">
                                  +{detectedChains.length - 3}
                                </span>
                              )}
                              {perpExchanges.map((exchangeId) => (
                                <span
                                  key={exchangeId}
                                  className="text-[10px] px-1 py-0  bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                >
                                  {getPerpExchangeName(exchangeId)}
                                </span>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <span className="text-[11px]">
                        {walletPositions.length}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className="text-[13px] font-semibold">
                        {hideBalances ? '••••••' : formatCurrency(walletValue)}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(wallet.id);
                          }}
                          className="p-1.5 hover:bg-[var(--negative-light)]  text-[var(--negative)] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <hr className="border-[var(--border)] my-6" />

      {/* Info note */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">About Wallet Tracking</p>
        <p className="text-[11px] text-[var(--foreground-muted)]">
          Wallets are tracked using the DeBank API. For perp exchange positions (Hyperliquid, Lighter, Ethereal),
          click on a wallet to enable specific exchanges. Only enabled exchanges will be queried for positions.
        </p>
      </div>

      <AddWalletModal
        isOpen={showAddWallet}
        onClose={() => setShowAddWallet(false)}
      />
    </div>
  );
}
