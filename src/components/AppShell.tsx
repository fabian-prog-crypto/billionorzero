'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, RefreshCw, Eye, EyeOff, Settings, Wallet } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useRefresh } from '@/components/PortfolioProvider';
import AddPositionModal from '@/components/modals/AddPositionModal';
import AddWalletModal from '@/components/modals/AddWalletModal';

type TopTab = 'portfolio' | 'market' | 'insights';
type SubTab = 'overview' | 'crypto' | 'stocks' | 'cash' | 'other';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [activeTopTab, setActiveTopTab] = useState<TopTab>('portfolio');
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);

  const { hideBalances, toggleHideBalances } = usePortfolioStore();
  const { refresh, isRefreshing } = useRefresh();

  // Determine active sub-tab from pathname
  const getActiveSubTab = (): SubTab => {
    if (pathname === '/crypto') return 'crypto';
    if (pathname === '/stocks') return 'stocks';
    if (pathname === '/cash') return 'cash';
    if (pathname === '/other') return 'other';
    return 'overview';
  };

  const activeSubTab = getActiveSubTab();

  const handleSubTabClick = (tab: SubTab) => {
    if (tab === 'overview') {
      router.push('/');
    } else {
      router.push(`/${tab}`);
    }
  };

  const handleTopTabClick = (tab: TopTab) => {
    if (tab === 'portfolio') {
      setActiveTopTab('portfolio');
      router.push('/');
    }
    // market and insights are disabled for now
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-6 lg:px-10 pt-6 lg:pt-8">
        {/* Top row with logo and actions */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">Billion or Zero</h1>
              <p className="text-xs text-[var(--foreground-muted)]">Portfolio Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleHideBalances}
              className="btn-ghost rounded-lg"
              title={hideBalances ? 'Show balances' : 'Hide balances'}
            >
              {hideBalances ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>

            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="btn-ghost rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowAddWallet(true)}
              className="btn-ghost rounded-lg"
              title="Add Wallet"
            >
              <Wallet className="w-5 h-5" />
            </button>

            <button
              onClick={() => router.push('/settings')}
              className="btn-ghost rounded-lg"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowAddPosition(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Position</span>
            </button>
          </div>
        </div>

        {/* Top tabs */}
        <div className="top-tabs">
          <button
            onClick={() => handleTopTabClick('portfolio')}
            className={`top-tab ${activeTopTab === 'portfolio' ? 'active' : ''}`}
          >
            PORTFOLIO
          </button>

          <div className="group relative">
            <button
              className="top-tab disabled"
              title="Coming Soon"
            >
              MARKET
              <span className="coming-soon">Soon</span>
            </button>
          </div>

          <div className="group relative">
            <button
              className="top-tab disabled"
              title="Coming Soon"
            >
              INSIGHTS
              <span className="coming-soon">Soon</span>
            </button>
          </div>
        </div>

        {/* Sub tabs - only show for portfolio */}
        {activeTopTab === 'portfolio' && (
          <div className="sub-tabs">
            <button
              onClick={() => handleSubTabClick('overview')}
              className={`sub-tab ${activeSubTab === 'overview' ? 'active' : ''}`}
            >
              Overview
            </button>
            <button
              onClick={() => handleSubTabClick('crypto')}
              className={`sub-tab ${activeSubTab === 'crypto' ? 'active' : ''}`}
            >
              Crypto
            </button>
            <button
              onClick={() => handleSubTabClick('stocks')}
              className={`sub-tab ${activeSubTab === 'stocks' ? 'active' : ''}`}
            >
              Stocks
            </button>
            <button
              onClick={() => handleSubTabClick('cash')}
              className={`sub-tab ${activeSubTab === 'cash' ? 'active' : ''}`}
            >
              Cash
            </button>
            <button
              onClick={() => handleSubTabClick('other')}
              className={`sub-tab ${activeSubTab === 'other' ? 'active' : ''}`}
            >
              Other
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="px-6 lg:px-10 pb-10">
        {children}
      </main>

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
