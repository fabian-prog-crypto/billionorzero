'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Edit2,
  ChevronRight,
} from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  calculateAssetSummary,
} from '@/services';
import CryptoIcon from '@/components/ui/CryptoIcon';
import CustomPriceModal from '@/components/modals/CustomPriceModal';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatAddress,
  getChangeColor,
} from '@/lib/utils';
import { AssetWithPrice } from '@/types';

// Aggregated position by source
interface AggregatedPosition {
  key: string;
  walletId?: string;
  walletName?: string;
  walletAddress?: string;
  chain?: string;
  protocol?: string;
  amount: number;
  value: number;
  isDebt: boolean;
  positions: AssetWithPrice[];
}

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const symbol = (params.symbol as string)?.toLowerCase();

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, wallets, hideBalances } = usePortfolioStore();

  // Get all positions with prices
  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

  // Filter positions for this asset
  const assetPositions = useMemo(() => {
    return allPositionsWithPrices.filter(
      (p) => p.symbol.toLowerCase() === symbol
    );
  }, [allPositionsWithPrices, symbol]);

  // Calculate aggregated asset data - SINGLE SOURCE OF TRUTH
  const assetData = useMemo(() => {
    return calculateAssetSummary(assetPositions);
  }, [assetPositions]);

  // Aggregate positions by source (wallet + protocol/chain combination)
  // Debt and non-debt positions are netted together
  const aggregatedPositions = useMemo((): AggregatedPosition[] => {
    const groups: Record<string, AggregatedPosition> = {};

    // Helper to find wallet by address
    const findWallet = (address: string) => {
      return wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    };

    assetPositions.forEach((p) => {
      // Create a unique key for grouping - aggregate debt and non-debt together
      let key: string;
      let walletId: string | undefined;
      let walletName: string | undefined;

      if (p.walletAddress) {
        // Group by wallet + protocol (or chain if no protocol)
        const location = p.protocol || p.chain || 'wallet';
        key = `${p.walletAddress}-${location}`;

        // Find wallet info
        const wallet = findWallet(p.walletAddress);
        if (wallet) {
          walletId = wallet.id;
          walletName = wallet.name;
        }
      } else {
        // Manual positions
        key = `manual-${p.protocol || 'none'}`;
      }

      if (!groups[key]) {
        groups[key] = {
          key,
          walletId,
          walletName,
          walletAddress: p.walletAddress,
          chain: p.chain,
          protocol: p.protocol,
          amount: 0,
          value: 0,
          isDebt: false, // Will be determined by net value
          positions: [],
        };
      }

      // Add amount (debt positions have negative value already)
      groups[key].amount += p.amount * (p.isDebt ? -1 : 1);
      groups[key].value += p.value;
      groups[key].positions.push(p);
    });

    // Determine if net position is debt (negative value)
    Object.values(groups).forEach(g => {
      g.isDebt = g.value < 0;
    });

    // Sort by value (descending) - positive values first, then negative
    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [assetPositions, wallets]);

  // Calculate P&L if cost basis exists
  const pnlData = useMemo(() => {
    if (!assetData?.totalCostBasis) return null;

    const pnl = assetData.totalValue - assetData.totalCostBasis;
    const pnlPercent = (pnl / assetData.totalCostBasis) * 100;

    return { pnl, pnlPercent };
  }, [assetData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const openCustomPriceModal = () => {
    if (assetData) {
      setCustomPriceModal({
        isOpen: true,
        asset: assetPositions[0],
      });
    }
  };

  // Not found state
  if (!assetData) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--foreground-muted)] text-sm mb-4">Asset not found</p>
        <button
          onClick={() => router.push('/crypto/assets')}
          className="btn btn-secondary text-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
      </div>
    );
  }

  const isPositive = assetData.changePercent24h >= 0;

  return (
    <div>
      {/* Back Navigation */}
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
          <CryptoIcon symbol={assetData.symbol} size={32} logoUrl={assetData.logo} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold">{assetData.symbol.toUpperCase()}</h1>
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium "
                style={{
                  backgroundColor: `${assetData.exposureCategoryColor}20`,
                  color: assetData.exposureCategoryColor,
                }}
              >
                {assetData.exposureCategoryLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={openCustomPriceModal}
                className="group flex items-center gap-1 hover:text-[var(--accent-primary)] transition-colors"
              >
                <span className="text-[13px]">
                  {formatCurrency(assetData.currentPrice)}
                </span>
                {assetData.hasCustomPrice && (
                  <span className="w-1.5 h-1.5  bg-[var(--accent-primary)]" />
                )}
                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </button>
              <span className={`text-[11px] ${getChangeColor(assetData.changePercent24h)}`}>
                {isPositive ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                {formatPercent(assetData.changePercent24h)}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Total Value</p>
          <p className="text-[15px] font-semibold">
            {hideBalances ? '••••••' : formatCurrency(assetData.totalValue)}
          </p>
          <p className="text-[11px] text-[var(--foreground-muted)]">
            {assetData.allocation.toFixed(1)}% of portfolio
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Holdings</p>
          <p className="text-[13px] font-medium">
            {hideBalances ? '••••' : formatNumber(assetData.totalAmount)}
          </p>
          <p className="text-[10px] text-[var(--foreground-muted)]">{assetData.symbol.toUpperCase()}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Avg Price</p>
          <p className="text-[13px] font-medium">
            {hideBalances ? '••••' : formatCurrency(assetData.totalValue / assetData.totalAmount)}
          </p>
          <p className="text-[10px] text-[var(--foreground-muted)]">per unit</p>
        </div>

        {pnlData ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Unrealized P&L</p>
            <p className={`text-[13px] font-medium ${getChangeColor(pnlData.pnl)}`}>
              {hideBalances ? '••••' : `${pnlData.pnl >= 0 ? '+' : ''}${formatCurrency(pnlData.pnl)}`}
            </p>
            <p className={`text-[10px] ${getChangeColor(pnlData.pnlPercent)}`}>
              {pnlData.pnlPercent >= 0 ? '+' : ''}{pnlData.pnlPercent.toFixed(1)}%
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Cost Basis</p>
            <p className="text-[13px] font-medium text-[var(--foreground-muted)]">--</p>
            <p className="text-[10px] text-[var(--foreground-muted)]">Not set</p>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-0.5">Distribution</p>
          <p className="text-[13px] font-medium">{aggregatedPositions.length}</p>
          <p className="text-[10px] text-[var(--foreground-muted)]">
            {aggregatedPositions.length === 1 ? 'location' : 'locations'}
          </p>
        </div>
      </div>

      <hr className="border-[var(--border)] mb-6" />

      {/* Holdings Table */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
          Holdings by Location
        </p>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-[11px] font-medium text-[var(--foreground-muted)] text-left pb-2">Source</th>
              <th className="text-[11px] font-medium text-[var(--foreground-muted)] text-left pb-2">Location</th>
              <th className="text-[11px] font-medium text-[var(--foreground-muted)] text-right pb-2">Amount</th>
              <th className="text-[11px] font-medium text-[var(--foreground-muted)] text-right pb-2">Value</th>
              <th className="text-[11px] font-medium text-[var(--foreground-muted)] text-right pb-2">%</th>
            </tr>
          </thead>
          <tbody>
            {aggregatedPositions.map((group) => {
              const percent = assetData.totalValue !== 0
                ? (group.value / assetData.totalValue) * 100
                : 0;

              return (
                <tr
                  key={group.key}
                  className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                    group.isDebt ? 'bg-[var(--negative-light)]' : ''
                  }`}
                >
                  <td className="py-1.5">
                    {group.walletAddress ? (
                      <div className="flex items-center gap-1.5">
                        <Wallet className="w-3 h-3 text-[var(--accent-primary)] flex-shrink-0" />
                        <div className="min-w-0">
                          {group.walletId ? (
                            <Link
                              href={`/crypto/wallets/${group.walletId}`}
                              className="flex items-center gap-1 text-[11px] font-medium hover:text-[var(--accent-primary)] transition-colors"
                            >
                              {group.walletName || 'Wallet'}
                              <ChevronRight className="w-2.5 h-2.5 opacity-50" />
                            </Link>
                          ) : (
                            <span className="text-[11px]">Unknown Wallet</span>
                          )}
                          <button
                            onClick={() => copyToClipboard(group.walletAddress!)}
                            className="flex items-center gap-1 font-mono text-[10px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                          >
                            {formatAddress(group.walletAddress, 4)}
                            {copiedAddress === group.walletAddress ? (
                              <Check className="w-2 h-2 text-[var(--positive)]" />
                            ) : (
                              <Copy className="w-2 h-2 opacity-40" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--foreground-muted)]">Manual</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      {group.chain && (
                        <span className="text-[10px] px-1 py-0  bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">{group.chain}</span>
                      )}
                      {group.protocol && (
                        <span className="text-[10px] px-1 py-0  bg-[var(--accent-primary)] text-white">
                          {group.protocol}
                        </span>
                      )}
                      {group.isDebt && (
                        <span className="px-1 py-0 text-[9px] font-semibold bg-[var(--negative)] text-white ">
                          DEBT
                        </span>
                      )}
                      {!group.chain && !group.protocol && !group.isDebt && (
                        <span className="text-[10px] text-[var(--foreground-muted)]">--</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono text-[11px]">
                    {hideBalances ? '••••' : formatNumber(group.amount)}
                  </td>
                  <td className={`py-1.5 text-right text-[11px] font-medium ${group.isDebt ? 'text-[var(--negative)]' : ''}`}>
                    {hideBalances ? '••••' : formatCurrency(group.value)}
                  </td>
                  <td className="py-1.5 text-right text-[10px] text-[var(--foreground-muted)]">
                    {percent.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Summary Footer */}
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[10px] text-[var(--foreground-muted)]">
            {assetPositions.length} position{assetPositions.length !== 1 ? 's' : ''} across {aggregatedPositions.length} location{aggregatedPositions.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-medium">
            {hideBalances ? '••••••' : formatCurrency(assetData.totalValue)}
          </span>
        </div>
      </div>

      {/* Custom Price Modal */}
      {customPriceModal.asset && (
        <CustomPriceModal
          isOpen={customPriceModal.isOpen}
          onClose={() => setCustomPriceModal({ isOpen: false, asset: null })}
          symbol={customPriceModal.asset.symbol}
          name={customPriceModal.asset.name}
          currentMarketPrice={
            customPriceModal.asset.hasCustomPrice
              ? prices[customPriceModal.asset.symbol.toLowerCase()]?.price || 0
              : customPriceModal.asset.currentPrice
          }
          currentCustomPrice={customPrices[customPriceModal.asset.symbol.toLowerCase()]?.price}
          currentNote={customPrices[customPriceModal.asset.symbol.toLowerCase()]?.note}
        />
      )}
    </div>
  );
}
