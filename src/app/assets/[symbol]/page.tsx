'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Edit2,
  PieChart,
  Layers,
  DollarSign,
  Calendar,
  Link2,
} from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  calculateAllPositionsWithPrices,
  getCategoryService,
  getExposureCategory,
  getExposureCategoryConfig,
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

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const symbol = (params.symbol as string)?.toLowerCase();

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [customPriceModal, setCustomPriceModal] = useState<{
    isOpen: boolean;
    asset: AssetWithPrice | null;
  }>({ isOpen: false, asset: null });

  const { positions, prices, customPrices, hideBalances } = usePortfolioStore();

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

  // Calculate aggregated asset data
  const assetData = useMemo(() => {
    if (assetPositions.length === 0) return null;

    const totalAmount = assetPositions.reduce((sum, p) => sum + p.amount, 0);
    const totalValue = assetPositions.reduce((sum, p) => sum + p.value, 0);
    const totalCostBasis = assetPositions.reduce(
      (sum, p) => sum + (p.costBasis || 0),
      0
    );
    const hasCostBasis = assetPositions.some((p) => p.costBasis);

    // Use first position for common data
    const first = assetPositions[0];

    // Calculate weighted average purchase date
    const positionsWithDates = assetPositions.filter((p) => p.purchaseDate);
    const earliestDate = positionsWithDates.length > 0
      ? positionsWithDates.reduce((earliest, p) => {
          const date = new Date(p.purchaseDate!);
          return date < earliest ? date : earliest;
        }, new Date(positionsWithDates[0].purchaseDate!))
      : null;

    // Get category info
    const categoryService = getCategoryService();
    const exposureCat = getExposureCategory(first.symbol, first.type);
    const exposureConfig = getExposureCategoryConfig(exposureCat);
    const mainCategory = categoryService.getMainCategory(first.symbol, first.type);

    // Count unique sources
    const uniqueWallets = new Set(assetPositions.filter(p => p.walletAddress).map(p => p.walletAddress));
    const uniqueChains = new Set(assetPositions.filter(p => p.chain).map(p => p.chain));
    const uniqueProtocols = new Set(assetPositions.filter(p => p.protocol).map(p => p.protocol));

    return {
      symbol: first.symbol,
      name: first.name,
      type: first.type,
      logo: first.logo,
      currentPrice: first.currentPrice,
      change24h: first.change24h,
      changePercent24h: first.changePercent24h,
      hasCustomPrice: first.hasCustomPrice,
      totalAmount,
      totalValue,
      totalCostBasis: hasCostBasis ? totalCostBasis : null,
      allocation: first.allocation,
      earliestDate,
      exposureCategory: exposureCat,
      exposureCategoryLabel: exposureConfig.label,
      exposureCategoryColor: exposureConfig.color,
      mainCategory,
      positionCount: assetPositions.length,
      walletCount: uniqueWallets.size,
      chainCount: uniqueChains.size,
      protocolCount: uniqueProtocols.size,
    };
  }, [assetPositions]);

  // Calculate P&L if cost basis exists
  const pnlData = useMemo(() => {
    if (!assetData?.totalCostBasis) return null;

    const pnl = assetData.totalValue - assetData.totalCostBasis;
    const pnlPercent = (pnl / assetData.totalCostBasis) * 100;

    // Calculate holding period (use a fixed reference to avoid hydration issues)
    let holdingDays = 0;
    if (assetData.earliestDate) {
      const now = new Date();
      holdingDays = Math.floor(
        (now.getTime() - assetData.earliestDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Annualized return
    let annualizedReturn = 0;
    if (holdingDays > 0) {
      annualizedReturn = ((1 + pnlPercent / 100) ** (365 / holdingDays) - 1) * 100;
    }

    return { pnl, pnlPercent, holdingDays, annualizedReturn };
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
        <p className="text-[var(--foreground-muted)] mb-4">Asset not found</p>
        <button
          onClick={() => router.push('/positions')}
          className="btn btn-secondary"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Positions
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
        className="flex items-center gap-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Hero Section */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {/* Asset Info */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center overflow-hidden">
              <CryptoIcon symbol={assetData.symbol} size={48} logoUrl={assetData.logo} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{assetData.name}</h1>
                <span className="text-lg text-[var(--foreground-muted)]">
                  {assetData.symbol.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2 py-0.5 text-xs font-medium rounded-full"
                  style={{
                    backgroundColor: `${assetData.exposureCategoryColor}20`,
                    color: assetData.exposureCategoryColor,
                  }}
                >
                  {assetData.exposureCategoryLabel}
                </span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  {assetData.mainCategory === 'crypto' ? 'Cryptocurrency' : assetData.mainCategory}
                </span>
              </div>
            </div>
          </div>

          {/* Price Info */}
          <div className="text-left md:text-right">
            <div className="flex items-center gap-2 md:justify-end mb-1">
              <button
                onClick={openCustomPriceModal}
                className="group flex items-center gap-2 hover:text-[var(--accent-primary)] transition-colors"
              >
                <span className="text-2xl font-bold">
                  {formatCurrency(assetData.currentPrice)}
                </span>
                {assetData.hasCustomPrice && (
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" title="Custom price" />
                )}
                <Edit2 className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity" />
              </button>
            </div>
            <div className={`flex items-center gap-2 md:justify-end ${getChangeColor(assetData.changePercent24h)}`}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="font-medium">
                {formatPercent(assetData.changePercent24h)}
              </span>
              <span className="text-[var(--foreground-muted)]">
                ({formatCurrency(Math.abs(assetData.change24h))})
              </span>
              <span className="text-xs text-[var(--foreground-muted)]">24h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Total Holdings */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
              Holdings
            </span>
          </div>
          <p className="text-xl font-semibold">
            {hideBalances ? '••••' : formatNumber(assetData.totalAmount)}
          </p>
          <p className="text-sm text-[var(--foreground-muted)]">
            {assetData.symbol.toUpperCase()}
          </p>
        </div>

        {/* Total Value */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
              Value
            </span>
          </div>
          <p className="text-xl font-semibold">
            {hideBalances ? '••••••' : formatCurrency(assetData.totalValue)}
          </p>
          <p className="text-sm text-[var(--foreground-muted)]">
            {assetData.allocation.toFixed(1)}% of portfolio
          </p>
        </div>

        {/* Cost Basis / P&L */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
              {pnlData ? 'Unrealized P&L' : 'Cost Basis'}
            </span>
          </div>
          {pnlData ? (
            <>
              <p className={`text-xl font-semibold ${getChangeColor(pnlData.pnl)}`}>
                {hideBalances ? '••••' : `${pnlData.pnl >= 0 ? '+' : ''}${formatCurrency(pnlData.pnl)}`}
              </p>
              <p className={`text-sm ${getChangeColor(pnlData.pnlPercent)}`}>
                {pnlData.pnlPercent >= 0 ? '+' : ''}{pnlData.pnlPercent.toFixed(1)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold text-[var(--foreground-muted)]">--</p>
              <p className="text-sm text-[var(--foreground-muted)]">No cost basis</p>
            </>
          )}
        </div>

        {/* Positions Count */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
              Distribution
            </span>
          </div>
          <p className="text-xl font-semibold">{assetData.positionCount}</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            {assetData.positionCount === 1 ? 'position' : 'positions'}
            {assetData.walletCount > 0 && ` · ${assetData.walletCount} wallet${assetData.walletCount > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Additional Stats Row */}
      {(pnlData?.holdingDays || assetData.chainCount > 0 || assetData.protocolCount > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {pnlData && pnlData.holdingDays > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  Holding Period
                </span>
              </div>
              <p className="text-xl font-semibold">{pnlData.holdingDays}</p>
              <p className="text-sm text-[var(--foreground-muted)]">days</p>
            </div>
          )}

          {pnlData && pnlData.annualizedReturn !== 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  Annualized
                </span>
              </div>
              <p className={`text-xl font-semibold ${getChangeColor(pnlData.annualizedReturn)}`}>
                {pnlData.annualizedReturn >= 0 ? '+' : ''}{pnlData.annualizedReturn.toFixed(1)}%
              </p>
              <p className="text-sm text-[var(--foreground-muted)]">return</p>
            </div>
          )}

          {assetData.totalCostBasis && (
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  Cost Basis
                </span>
              </div>
              <p className="text-xl font-semibold">
                {hideBalances ? '••••' : formatCurrency(assetData.totalCostBasis)}
              </p>
              <p className="text-sm text-[var(--foreground-muted)]">
                Avg: {formatCurrency(assetData.totalCostBasis / assetData.totalAmount)}
              </p>
            </div>
          )}

          {assetData.chainCount > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
                  Chains
                </span>
              </div>
              <p className="text-xl font-semibold">{assetData.chainCount}</p>
              <p className="text-sm text-[var(--foreground-muted)]">
                {assetData.protocolCount > 0 && `${assetData.protocolCount} protocol${assetData.protocolCount > 1 ? 's' : ''}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Positions Table */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Positions</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left pb-3">Source</th>
                <th className="table-header text-left pb-3">Location</th>
                <th className="table-header text-right pb-3">Amount</th>
                <th className="table-header text-right pb-3">Value</th>
                <th className="table-header text-right pb-3">%</th>
              </tr>
            </thead>
            <tbody>
              {assetPositions.map((position) => {
                const isDebt = position.isDebt;
                const positionPercent = assetData.totalValue !== 0
                  ? (position.value / assetData.totalValue) * 100
                  : 0;

                return (
                  <tr
                    key={position.id}
                    className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--background-secondary)] transition-colors ${
                      isDebt ? 'bg-[var(--negative-light)]' : ''
                    }`}
                  >
                    <td className="py-3">
                      {position.walletAddress ? (
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-[var(--accent-primary)]" />
                          <button
                            onClick={() => copyToClipboard(position.walletAddress!)}
                            className="flex items-center gap-1 hover:text-[var(--accent-primary)] transition-colors"
                          >
                            <span className="font-mono text-sm">
                              {formatAddress(position.walletAddress, 6)}
                            </span>
                            {copiedAddress === position.walletAddress ? (
                              <Check className="w-3 h-3 text-[var(--positive)]" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-50" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--foreground-muted)]">Manual</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {position.chain && (
                          <span className="tag text-[10px] py-0.5 px-1.5">
                            {position.chain}
                          </span>
                        )}
                        {position.protocol && (
                          <span className="tag text-[10px] py-0.5 px-1.5 bg-[var(--accent-primary)] text-white">
                            {position.protocol}
                          </span>
                        )}
                        {isDebt && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--negative)] text-white rounded">
                            DEBT
                          </span>
                        )}
                        {!position.chain && !position.protocol && !isDebt && (
                          <span className="text-xs text-[var(--foreground-muted)]">--</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono text-sm">
                      {hideBalances ? '••••' : formatNumber(position.amount)}
                    </td>
                    <td className={`py-3 text-right font-semibold ${isDebt ? 'text-[var(--negative)]' : ''}`}>
                      {hideBalances ? '••••' : formatCurrency(position.value)}
                    </td>
                    <td className="py-3 text-right text-sm text-[var(--foreground-muted)]">
                      {Math.abs(positionPercent).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-muted)]">
            {assetPositions.length} position{assetPositions.length !== 1 ? 's' : ''}
          </span>
          <span className="font-semibold">
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
