'use client';

import { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, ArrowUpRight, Wallet, Eye, EyeOff } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculatePortfolioSummary, calculateAllPositionsWithPrices, calculateExposureData } from '@/services';
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

  // Use centralized exposure calculation - single source of truth
  const exposureData = useMemo(() => {
    return calculateExposureData(allAssetsWithPrices);
  }, [allAssetsWithPrices]);

  // Extract what we need from the centralized calculation
  const { categories, perpsBreakdown, simpleBreakdown, exposureMetrics, perpsMetrics, concentrationMetrics, spotDerivatives } = exposureData;

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main content - Left side */}
          <div className="lg:col-span-8 space-y-6">
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
                    aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
                  >
                    {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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

            {/* Professional Investor Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {/* Gross Exposure */}
              <div className="card">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Gross Exposure</p>
                <p className="text-lg font-semibold">
                  {hideBalances ? '****' : formatCurrency(exposureMetrics.grossExposure)}
                </p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-[var(--positive)]">L: {hideBalances ? '**' : formatCurrency(exposureMetrics.longExposure)}</span>
                  <span className="text-[var(--negative)]">S: {hideBalances ? '**' : formatCurrency(exposureMetrics.shortExposure)}</span>
                </div>
              </div>

              {/* Leverage */}
              <div className="card">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Leverage</p>
                <p className={`text-lg font-semibold ${exposureMetrics.leverage > 2 ? 'text-[var(--negative)]' : exposureMetrics.leverage > 1.5 ? 'text-yellow-600' : ''}`}>
                  {exposureMetrics.leverage.toFixed(2)}x
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  {exposureMetrics.leverage <= 1 ? 'No leverage' : exposureMetrics.leverage <= 1.5 ? 'Low' : exposureMetrics.leverage <= 2 ? 'Moderate' : 'High'}
                </p>
              </div>

              {/* Cash Position */}
              <div className="card">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Cash & Stables</p>
                <p className="text-lg font-semibold text-[var(--positive)]">
                  {hideBalances ? '****' : formatCurrency(exposureMetrics.cashPosition)}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  {exposureMetrics.cashPercentage.toFixed(1)}% of assets
                </p>
              </div>

              {/* Concentration */}
              <div className="card">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Top 5 Concentration</p>
                <p className={`text-lg font-semibold ${concentrationMetrics.top5Percentage > 80 ? 'text-[var(--negative)]' : concentrationMetrics.top5Percentage > 60 ? 'text-yellow-600' : ''}`}>
                  {concentrationMetrics.top5Percentage.toFixed(1)}%
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  {concentrationMetrics.assetCount} assets
                </p>
              </div>
            </div>

            {/* Spot vs Derivatives Breakdown */}
            {(spotDerivatives.derivativesLong > 0 || spotDerivatives.derivativesShort > 0) && (
              <div className="card">
                <h3 className="font-semibold text-sm mb-3">Exposure Breakdown</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Spot */}
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)] mb-2">Spot Positions</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">Long</span>
                        <span className="text-[var(--positive)]">{hideBalances ? '****' : formatCurrency(spotDerivatives.spotLong)}</span>
                      </div>
                      {spotDerivatives.spotShort > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">Short/Borrowed</span>
                          <span className="text-[var(--negative)]">-{hideBalances ? '****' : formatCurrency(spotDerivatives.spotShort)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium pt-1 border-t border-[var(--border)]">
                        <span>Net Spot</span>
                        <span>{hideBalances ? '****' : formatCurrency(spotDerivatives.spotNet)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Derivatives */}
                  <div>
                    <p className="text-xs text-[var(--foreground-muted)] mb-2">Derivatives (Perps)</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground-muted)]">Long Notional</span>
                        <span className="text-[var(--positive)]">{hideBalances ? '****' : formatCurrency(spotDerivatives.derivativesLong)}</span>
                      </div>
                      {spotDerivatives.derivativesShort > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[var(--foreground-muted)]">Short Notional</span>
                          <span className="text-[var(--negative)]">-{hideBalances ? '****' : formatCurrency(spotDerivatives.derivativesShort)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium pt-1 border-t border-[var(--border)]">
                        <span>Net Perps</span>
                        <span className={spotDerivatives.derivativesNet < 0 ? 'text-[var(--negative)]' : ''}>{hideBalances ? '****' : formatCurrency(spotDerivatives.derivativesNet)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Margin info */}
                {perpsMetrics.collateral > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--foreground-muted)]">Margin Deposited</span>
                      <span>{hideBalances ? '****' : formatCurrency(perpsMetrics.collateral)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-[var(--foreground-muted)]">Est. Margin Used</span>
                      <span className={perpsMetrics.utilizationRate > 80 ? 'text-[var(--negative)]' : ''}>
                        {hideBalances ? '****' : formatCurrency(perpsMetrics.marginUsed)} ({perpsMetrics.utilizationRate.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Asset Allocation by Category */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Asset Allocation</h3>
                <Link href="/exposure" className="text-xs text-[var(--accent-primary)]">
                  View Details
                </Link>
              </div>
              <div className="space-y-2">
                {simpleBreakdown.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{item.label}</span>
                        <span className="font-medium ml-2">{hideBalances ? '****' : formatCurrency(item.value)}</span>
                      </div>
                      <div className="w-full bg-[var(--background-secondary)] rounded-full h-1.5 mt-1">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.max(0, Math.min(100, item.percentage))}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-[var(--foreground-muted)] w-12 text-right">{item.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
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
          <div className="lg:col-span-4 space-y-6">
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
