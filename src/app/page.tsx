'use client';

import { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, ArrowUpRight, Wallet, Eye, EyeOff } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary, calculateAllPositionsWithPrices } from '@/services';
import Header from '@/components/Header';
import NetWorthChart from '@/components/charts/NetWorthChart';
import AllocationChart from '@/components/charts/AllocationChart';
import ExposureChart from '@/components/charts/ExposureChart';
import AddPositionModal from '@/components/modals/AddPositionModal';
import AddWalletModal from '@/components/modals/AddWalletModal';
import { useRefresh } from '@/components/PortfolioProvider';
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getChangeColor,
} from '@/lib/utils';
import {
  AssetCategory,
  getAssetCategory,
  getCategoryLabel,
  CATEGORY_COLORS,
} from '@/lib/assetCategories';
import Link from 'next/link';

export default function OverviewPage() {
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);

  const { positions, prices, snapshots, wallets, hideBalances, toggleHideBalances } = usePortfolioStore();
  const { refresh } = useRefresh();

  // Calculate portfolio summary
  const summary = useMemo(() => {
    return calculatePortfolioSummary(positions, prices);
  }, [positions, prices]);

  // Calculate all positions for exposure chart (not just top 10)
  const allAssetsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices);
  }, [positions, prices]);

  // Calculate category breakdown
  const categoryBreakdown = useMemo(() => {
    const categories: Record<AssetCategory, number> = {
      stablecoins: 0,
      btc: 0,
      eth: 0,
      sol: 0,
      cash: 0,
      stocks: 0,
      other: 0,
    };

    allAssetsWithPrices.forEach((asset) => {
      const category = getAssetCategory(asset.symbol, asset.type);
      categories[category] += asset.value;
    });

    return categories;
  }, [allAssetsWithPrices]);

  // Get price data for watchlist
  const watchlist = useMemo(() => {
    const symbols = ['bitcoin', 'ethereum', 'solana', 'arbitrum'];
    return symbols.map((id) => {
      const priceData = prices[id];
      return {
        id,
        symbol: id === 'bitcoin' ? 'BTC' : id === 'ethereum' ? 'ETH' : id === 'solana' ? 'SOL' : 'ARB',
        price: priceData?.price || 0,
        change1h: 0,
        change24h: priceData?.changePercent24h || 0,
      };
    });
  }, [prices]);

  const hasData = positions.length > 0 || wallets.length > 0;

  return (
    <div>
      <Header title="Overview" onSync={refresh} />

      {!hasData ? (
        // Empty state
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-[var(--background-secondary)] rounded-full flex items-center justify-center mb-6">
            <Wallet className="w-10 h-10 text-[var(--foreground-muted)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No positions yet</h2>
          <p className="text-[var(--foreground-muted)] mb-6 text-center max-w-md">
            Start tracking your portfolio by adding positions manually or connecting a wallet.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddPosition(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
              Add Position
            </button>
            <button
              onClick={() => setShowAddWallet(true)}
              className="btn btn-secondary"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Main content - Left side */}
          <div className="col-span-8 space-y-6">
            {/* Net Worth Card */}
            <div className="card">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[var(--foreground-muted)] text-sm mb-1">
                    Total Net Worth
                  </p>
                  <h2 className="text-3xl font-bold">
                    {hideBalances ? '******' : formatCurrency(summary.totalValue)}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    {summary.changePercent24h >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-positive" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-negative" />
                    )}
                    <span className={getChangeColor(summary.changePercent24h)}>
                      {formatPercent(summary.changePercent24h)}
                    </span>
                    <span className="text-[var(--foreground-muted)] text-sm">
                      ({hideBalances ? '****' : formatCurrency(Math.abs(summary.change24h))}) 24h
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={toggleHideBalances}
                    className="btn btn-secondary"
                    title={hideBalances ? 'Show balances' : 'Hide balances'}
                  >
                    {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setShowAddPosition(true)}
                    className="btn btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    Add Position
                  </button>
                </div>
              </div>

              {/* Chart */}
              <div className="chart-container">
                <NetWorthChart snapshots={snapshots} height={180} />
              </div>
            </div>

            {/* Category breakdown with quick links */}
            <div className="grid grid-cols-5 gap-3">
              {(['stablecoins', 'btc', 'eth', 'sol', 'cash', 'stocks', 'other'] as AssetCategory[]).map((cat) => {
                const value = categoryBreakdown[cat];
                const percentage = summary.totalValue > 0 ? (value / summary.totalValue) * 100 : 0;
                return (
                  <Link
                    key={cat}
                    href={`/positions?category=${cat}`}
                    className="card hover:border-[var(--accent-primary)] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                      />
                      <p className="text-sm text-[var(--foreground-muted)] group-hover:text-[var(--foreground)]">
                        {getCategoryLabel(cat)}
                      </p>
                    </div>
                    <p className="text-lg font-semibold">
                      {hideBalances ? '****' : formatCurrency(value)}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {percentage.toFixed(1)}%
                    </p>
                  </Link>
                );
              })}
            </div>

            {/* Top Positions */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Top Positions</h3>
                <a href="/positions" className="text-sm text-[var(--accent-primary)] flex items-center gap-1">
                  See all <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
              <div className="space-y-3">
                {summary.topAssets.slice(0, 5).map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                        {asset.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{asset.symbol.toUpperCase()}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {hideBalances ? '***' : formatNumber(asset.amount)} @ {formatCurrency(asset.currentPrice)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{hideBalances ? '****' : formatCurrency(asset.value)}</p>
                      <p className={`text-xs ${getChangeColor(asset.changePercent24h)}`}>
                        {formatPercent(asset.changePercent24h)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar - Right side */}
          <div className="col-span-4 space-y-6">
            {/* Exposure by Category Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Exposure</h3>
              </div>
              <ExposureChart assets={allAssetsWithPrices} size={160} />
            </div>

            {/* Allocation Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Top Assets</h3>
              </div>
              <AllocationChart assets={summary.topAssets} size={160} />
            </div>

            {/* Prices Watchlist */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Prices</h3>
                <span className="live-indicator">Live</span>
              </div>
              <div className="space-y-3">
                {watchlist.map((coin) => (
                  <div
                    key={coin.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-[var(--tag-bg)] rounded-full flex items-center justify-center text-xs font-semibold">
                        {coin.symbol.slice(0, 1)}
                      </div>
                      <span className="font-medium text-sm">{coin.symbol}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {coin.price > 0 ? formatCurrency(coin.price) : '-'}
                      </p>
                      <p className={`text-xs ${getChangeColor(coin.change24h)}`}>
                        {coin.price > 0 ? formatPercent(coin.change24h) : '-'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connected Wallets */}
            {wallets.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Connected Wallets</h3>
                  <button
                    onClick={() => setShowAddWallet(true)}
                    className="text-sm text-[var(--accent-primary)]"
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-2">
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className="flex items-center gap-2 p-2 bg-[var(--background-secondary)] rounded-lg"
                    >
                      <Wallet className="w-4 h-4 text-[var(--foreground-muted)]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{wallet.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)] font-mono truncate">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddPositionModal
        isOpen={showAddPosition}
        onClose={() => setShowAddPosition(false)}
      />
      <AddWalletModal
        isOpen={showAddWallet}
        onClose={() => setShowAddWallet(false)}
      />
    </div>
  );
}
