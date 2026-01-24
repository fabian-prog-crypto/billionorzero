'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Wallet, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services';
import Header from '@/components/Header';
import { useRefresh } from '@/components/PortfolioProvider';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatAddress,
  getChangeColor,
  getChainColor,
} from '@/lib/utils';

export default function WalletDetailPage() {
  const params = useParams();
  const router = useRouter();
  const walletId = params.id as string;
  const [copiedAddress, setCopiedAddress] = useState(false);

  const { wallets, positions, prices, hideBalances } = usePortfolioStore();
  const { refresh } = useRefresh();

  const wallet = wallets.find((w) => w.id === walletId);

  // Get positions for this wallet
  const walletPositions = useMemo(() => {
    if (!wallet) return [];
    return positions.filter((p) => p.walletAddress === wallet.address);
  }, [positions, wallet]);

  // Calculate positions with prices
  const positionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(walletPositions, prices);
  }, [walletPositions, prices]);

  // Calculate totals
  const totalValue = useMemo(() => {
    return positionsWithPrices.reduce((sum, p) => sum + p.value, 0);
  }, [positionsWithPrices]);

  const totalChange24h = useMemo(() => {
    return positionsWithPrices.reduce((sum, p) => sum + p.change24h, 0);
  }, [positionsWithPrices]);

  const changePercent24h = totalValue > 0
    ? (totalChange24h / (totalValue - totalChange24h)) * 100
    : 0;

  // Group by chain
  const positionsByChain = useMemo(() => {
    const groups: Record<string, typeof positionsWithPrices> = {};
    positionsWithPrices.forEach((p) => {
      const chain = p.chain || 'unknown';
      if (!groups[chain]) {
        groups[chain] = [];
      }
      groups[chain].push(p);
    });
    return groups;
  }, [positionsWithPrices]);

  const copyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  if (!wallet) {
    return (
      <div>
        <Header title="Wallet Not Found" onSync={refresh} />
        <div className="card text-center py-12">
          <p className="text-[var(--foreground-muted)] mb-4">
            This wallet could not be found.
          </p>
          <button
            onClick={() => router.push('/wallets')}
            className="btn btn-primary"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Wallets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Wallet Details" onSync={refresh} />

      {/* Back button */}
      <button
        onClick={() => router.push('/wallets')}
        className="flex items-center gap-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Wallets
      </button>

      {/* Wallet info card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[var(--accent-primary)] rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{wallet.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm text-[var(--foreground-muted)] font-mono">
                  {formatAddress(wallet.address, 10)}
                </code>
                <button
                  onClick={copyAddress}
                  className="p-1 hover:bg-[var(--background-secondary)] rounded"
                >
                  {copiedAddress ? (
                    <Check className="w-3.5 h-3.5 text-[var(--positive)]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                  )}
                </button>
                <a
                  href={`https://etherscan.io/address/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-[var(--background-secondary)] rounded"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                </a>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              {hideBalances ? '******' : formatCurrency(totalValue)}
            </p>
            <p className={`text-sm ${getChangeColor(changePercent24h)}`}>
              {formatPercent(changePercent24h)} ({hideBalances ? '****' : formatCurrency(Math.abs(totalChange24h))}) 24h
            </p>
          </div>
        </div>

        {/* Chain badges */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {wallet.chains.map((chain) => (
            <span
              key={chain}
              className="px-2 py-1 text-xs rounded-full"
              style={{
                backgroundColor: `${getChainColor(chain)}20`,
                color: getChainColor(chain),
              }}
            >
              {chain.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Total Assets</p>
          <p className="text-xl font-semibold">{positionsWithPrices.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Chains</p>
          <p className="text-xl font-semibold">{Object.keys(positionsByChain).length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--foreground-muted)] mb-1">Added</p>
          <p className="text-xl font-semibold">
            {new Date(wallet.addedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Assets table */}
      <div className="card">
        <h3 className="font-semibold mb-4">Assets ({positionsWithPrices.length})</h3>

        {positionsWithPrices.length === 0 ? (
          <p className="text-center py-8 text-[var(--foreground-muted)]">
            No assets found in this wallet. Try syncing to fetch the latest data.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-left pb-3">Chain</th>
                <th className="table-header text-right pb-3">Amount</th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">24h</th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {positionsWithPrices.map((position) => {
                const isDebt = position.isDebt;
                return (
                  <tr
                    key={position.id}
                    className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                      isDebt ? 'bg-[var(--negative-light)]' : ''
                    }`}
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isDebt ? 'bg-[var(--negative)] text-white' : 'bg-[var(--tag-bg)]'
                        }`}>
                          {position.symbol.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{position.symbol.toUpperCase()}</p>
                            {isDebt && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--negative)] text-white rounded">
                                DEBT
                              </span>
                            )}
                            {position.protocol && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[var(--accent-primary)] text-white rounded">
                                {position.protocol}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--foreground-muted)]">{position.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className="px-2 py-0.5 text-xs rounded-full"
                        style={{
                          backgroundColor: `${getChainColor(position.chain || 'eth')}20`,
                          color: getChainColor(position.chain || 'eth'),
                        }}
                      >
                        {(position.chain || 'eth').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-sm">
                      {hideBalances ? '***' : formatNumber(position.amount)}
                    </td>
                    <td className="py-3 text-right font-mono text-sm">
                      {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                    </td>
                    <td className={`py-3 text-right font-semibold ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                      {hideBalances ? '****' : position.value !== 0 ? formatCurrency(position.value) : '-'}
                    </td>
                    <td className={`py-3 text-right ${getChangeColor(position.changePercent24h)}`}>
                      {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                    </td>
                    <td className={`py-3 text-right ${isDebt ? 'text-[var(--negative)]' : 'text-[var(--foreground-muted)]'}`}>
                      {position.allocation.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
