'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet, ExternalLink, Copy, Check, ChevronRight } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices, calculatePortfolioSummary } from '@/services';
import CryptoIcon from '@/components/ui/CryptoIcon';
import SearchInput from '@/components/ui/SearchInput';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatAddress,
  getChangeColor,
  getChainColor,
} from '@/lib/utils';
import { PerpExchange, WalletConnection } from '@/types';
import { getSupportedPerpExchanges } from '@/services';

export default function WalletDetailPage() {
  const params = useParams();
  const router = useRouter();
  const walletId = params.id as string;
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const store = usePortfolioStore();
  const { positions, prices, customPrices, hideBalances, updateAccount } = store;
  const wallets = store.wallets();

  const wallet = wallets.find((w) => w.id === walletId);

  const walletAddress = wallet && (wallet.connection.dataSource === 'debank' || wallet.connection.dataSource === 'helius')
    ? (wallet.connection as WalletConnection).address : '';
  const walletPerpExchanges = wallet && (wallet.connection.dataSource === 'debank' || wallet.connection.dataSource === 'helius')
    ? (wallet.connection as WalletConnection).perpExchanges : undefined;

  // Toggle perp exchange for this wallet
  const togglePerpExchange = (exchange: PerpExchange) => {
    if (!wallet) return;
    const currentExchanges = walletPerpExchanges || [];
    const newExchanges = currentExchanges.includes(exchange)
      ? currentExchanges.filter(e => e !== exchange)
      : [...currentExchanges, exchange];
    updateAccount(wallet.id, {
      connection: { ...wallet.connection, perpExchanges: newExchanges.length > 0 ? newExchanges : undefined } as WalletConnection,
    });
  };

  // Get positions for this wallet
  const walletPositions = useMemo(() => {
    if (!wallet) return [];
    return positions.filter((p) => p.accountId === wallet.id);
  }, [positions, wallet]);

  // Calculate positions with prices
  const positionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(walletPositions, prices, customPrices);
  }, [walletPositions, prices, customPrices]);

  // Filter positions by search query
  const filteredPositions = useMemo(() => {
    if (!searchQuery) return positionsWithPrices;
    const query = searchQuery.toLowerCase();
    return positionsWithPrices.filter(
      (p) =>
        p.symbol.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.chain?.toLowerCase().includes(query) ||
        p.protocol?.toLowerCase().includes(query)
    );
  }, [positionsWithPrices, searchQuery]);

  // Get wallet summary from centralized service (single source of truth)
  const walletSummary = useMemo(() => {
    return calculatePortfolioSummary(walletPositions, prices, customPrices);
  }, [walletPositions, prices, customPrices]);

  // Extract values from service - no local calculations
  const totalValue = walletSummary.totalValue;
  const changePercent24h = walletSummary.changePercent24h;

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
    navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  if (!wallet) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--foreground-muted)] text-sm mb-4">Wallet not found</p>
        <button
          onClick={() => router.push('/crypto/wallets')}
          className="btn btn-secondary text-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--accent-primary)]  flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold">{wallet.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={copyAddress}
                className="flex items-center gap-1 font-mono text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {formatAddress(walletAddress, 6)}
                {copiedAddress ? (
                  <Check className="w-2.5 h-2.5 text-[var(--positive)]" />
                ) : (
                  <Copy className="w-2.5 h-2.5 opacity-50" />
                )}
              </button>
              <a
                href={`https://etherscan.io/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Total Value</p>
          <p className="text-[15px] font-semibold">
            {hideBalances ? '••••••' : formatCurrency(totalValue)}
          </p>
          <p className={`text-[11px] ${getChangeColor(changePercent24h)}`}>
            {formatPercent(changePercent24h)} 24h
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Assets</p>
          <p className="text-[13px] font-medium">{positionsWithPrices.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Chains</p>
          <p className="text-[13px] font-medium">{Object.keys(positionsByChain).length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Added</p>
          <p className="text-[13px] font-medium">{new Date(wallet.addedAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Active Chains</p>
          <div className="flex gap-1 flex-wrap mt-1">
            {Object.keys(positionsByChain).length > 0 ? (
              Object.keys(positionsByChain).map((chain) => (
                <span
                  key={chain}
                  className="px-1 py-0 text-[10px] "
                  style={{
                    backgroundColor: `${getChainColor(chain)}20`,
                    color: getChainColor(chain),
                  }}
                >
                  {chain}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-[var(--foreground-muted)]">--</span>
            )}
          </div>
        </div>
      </div>

      {/* Perp Exchange Settings */}
      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Perp Exchanges</p>
        <div className="flex flex-wrap gap-1.5">
          {getSupportedPerpExchanges().map((exchange) => {
            const isEnabled = walletPerpExchanges?.includes(exchange.id) || false;
            return (
              <button
                key={exchange.id}
                onClick={() => togglePerpExchange(exchange.id)}
                className={`px-2 py-1  text-[11px] font-medium transition-colors ${
                  isEnabled
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {exchange.name}
              </button>
            );
          })}
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
          Assets ({filteredPositions.length}{searchQuery && ` of ${positionsWithPrices.length}`})
        </p>
        <div className="flex-1" />
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search..."
        />
      </div>

      {/* Assets table */}
      <div>

        {filteredPositions.length === 0 ? (
          <p className="text-center py-8 text-[11px] text-[var(--foreground-muted)]">
            {searchQuery ? 'No assets match your search.' : 'No assets found in this wallet.'}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Asset</th>
                <th className="table-header text-left pb-3">Location</th>
                <th className="table-header text-right pb-3">Amount</th>
                <th className="table-header text-right pb-3">Price</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">24h</th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((position) => {
                const isDebt = position.isDebt;
                return (
                  <tr
                    key={position.id}
                    className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                      isDebt ? 'bg-[var(--negative-light)]' : ''
                    }`}
                  >
                    <td className="py-2">
                      <Link
                        href={`/assets/${position.symbol.toLowerCase()}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <CryptoIcon symbol={position.symbol} size={20} isDebt={isDebt} logoUrl={position.logo} />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium hover:text-[var(--accent-primary)] transition-colors">
                            {position.symbol.toUpperCase()}
                          </span>
                          {isDebt && (
                            <span className="px-1 py-0 text-[9px] font-semibold bg-[var(--negative)] text-white ">
                              DEBT
                            </span>
                          )}
                          <ChevronRight className="w-2.5 h-2.5 opacity-40" />
                        </div>
                      </Link>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {position.chain && (
                          <span
                            className="px-1 py-0 text-[10px] "
                            style={{
                              backgroundColor: `${getChainColor(position.chain)}20`,
                              color: getChainColor(position.chain),
                            }}
                          >
                            {position.chain}
                          </span>
                        )}
                        {position.protocol && (
                          <span className="px-1 py-0 text-[10px]  bg-[var(--accent-primary)] text-white">
                            {position.protocol}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-[11px]">
                      {hideBalances ? '••••' : formatNumber(position.amount)}
                    </td>
                    <td className="py-2 text-right font-mono text-[11px]">
                      {position.currentPrice > 0 ? formatCurrency(position.currentPrice) : '-'}
                    </td>
                    <td className={`py-2 text-right text-[11px] font-medium ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                      {hideBalances ? '••••' : position.value !== 0 ? formatCurrency(position.value) : '-'}
                    </td>
                    <td className={`py-2 text-right text-[11px] ${getChangeColor(position.changePercent24h)}`}>
                      {position.currentPrice > 0 ? formatPercent(position.changePercent24h) : '-'}
                    </td>
                    <td className={`py-2 text-right text-[10px] ${isDebt ? 'text-[var(--negative)]' : 'text-[var(--foreground-muted)]'}`}>
                      {position.allocation.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Summary Footer */}
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[10px] text-[var(--foreground-muted)]">
            {filteredPositions.length} asset{filteredPositions.length !== 1 ? 's' : ''}{searchQuery && ` (filtered)`}
          </span>
          <span className="text-xs font-medium">
            {hideBalances ? '••••••' : formatCurrency(filteredPositions.reduce((sum, p) => sum + p.value, 0))}
          </span>
        </div>
      </div>
    </div>
  );
}
