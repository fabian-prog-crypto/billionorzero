'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, RefreshCw, Eye, EyeOff, Settings, Wallet, Sun, Moon, Menu, X, PieChart, TrendingUp, Layers, CandlestickChart, Building2, LayoutDashboard } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useThemeStore, applyTheme } from '@/store/themeStore';
import { useRefresh } from '@/components/PortfolioProvider';
import AddPositionModal from '@/components/modals/AddPositionModal';
import AddWalletModal from '@/components/modals/AddWalletModal';
import { calculateSyncCost } from '@/lib/constants';

type MainTab = 'portfolio' | 'insights';
type SubTab = 'overview' | 'crypto' | 'stocks' | 'cash' | 'other';

// Sidebar items per category (paths are relative, will be prefixed with category)
// Empty path '' means category root (e.g., /crypto for crypto category)
const sidebarItemsByCategory: Record<SubTab, { path: string; icon: typeof Layers; label: string }[]> = {
  overview: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Positions' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
    { path: 'performance', icon: TrendingUp, label: 'Performance' },
  ],
  crypto: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Positions' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
    { path: 'perps', icon: CandlestickChart, label: 'Perps' },
    { path: 'wallets', icon: Wallet, label: 'Wallets' },
    { path: 'accounts', icon: Building2, label: 'Accounts' },
  ],
  stocks: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Positions' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
  ],
  cash: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Positions' },
  ],
  other: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Positions' },
  ],
};

// Helper to build full href based on category
const buildHref = (category: SubTab, path: string): string => {
  if (category === 'overview') {
    return path ? `/${path}` : '/';
  }
  return path ? `/${category}/${path}` : `/${category}`;
};

const subTabs: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Others' },
];

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [showAddPosition, setShowAddPosition] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { hideBalances, toggleHideBalances, wallets } = usePortfolioStore();
  const { theme, setTheme } = useThemeStore();
  const { refresh, isRefreshing } = useRefresh();

  // Calculate sync costs
  const walletCount = wallets.length;
  const syncCost = calculateSyncCost(walletCount);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);

    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Determine active sub-tab from pathname
  const getActiveSubTab = (): SubTab => {
    if (pathname.startsWith('/crypto')) return 'crypto';
    if (pathname.startsWith('/stocks')) return 'stocks';
    if (pathname.startsWith('/cash')) return 'cash';
    if (pathname.startsWith('/other')) return 'other';
    return 'overview';
  };

  const activeSubTab = getActiveSubTab();

  // Get current sidebar page from pathname
  // Returns '' for category root, or the sub-page name
  const getCurrentSidebarPage = (): string => {
    const parts = pathname.split('/').filter(Boolean);
    if (activeSubTab === 'overview') {
      // For overview: / -> '', /positions -> 'positions'
      return parts[0] || '';
    }
    // For other categories: /crypto -> '', /crypto/positions -> 'positions'
    return parts[1] || '';
  };

  const currentSidebarPage = getCurrentSidebarPage();

  const handleSubTabClick = (tab: SubTab) => {
    if (tab === 'overview') {
      router.push('/');
    } else {
      router.push(`/${tab}`);
    }
  };

  // Get effective theme (resolves 'system' to actual theme)
  const getEffectiveTheme = () => {
    if (theme === 'system') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  };

  const effectiveTheme = getEffectiveTheme();

  const toggleTheme = () => {
    if (effectiveTheme === 'dark') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  };

  // Check if current path is a portfolio sub-tab page
  const isPortfolioPage = pathname === '/' || pathname === '/crypto' || pathname === '/stocks' || pathname === '/cash' || pathname === '/other';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <header className="bg-[var(--background)]">
        {/* Row 1: Main Navigation */}
        <div className="flex items-center justify-between px-6 lg:px-8 border-b border-[var(--border)]">
          {/* Logo */}
          <Link href="/" className="flex items-center py-4">
            <span className="text-xl tracking-tight" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              billionorzero
            </span>
          </Link>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="btn-ghost"
              title={effectiveTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {effectiveTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleHideBalances}
              className="btn-ghost"
              title={hideBalances ? 'Show balances' : 'Hide balances'}
            >
              {hideBalances ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>

            <div className="relative group">
              <button
                onClick={refresh}
                disabled={isRefreshing}
                className="btn-ghost"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <div className="tooltip whitespace-nowrap">
                {walletCount > 0 ? (
                  <>
                    <div>Per sync: {syncCost.units} units (~${syncCost.costPerSync.toFixed(4)})</div>
                    <div>Est. monthly: ~${syncCost.monthlyCost.toFixed(2)} (1x/day)</div>
                  </>
                ) : (
                  <div>Add wallets to track sync costs</div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowAddWallet(true)}
              className="btn-ghost"
              title="Add Wallet"
            >
              <Wallet className="w-5 h-5" />
            </button>

            <Link
              href="/settings"
              className="btn-ghost"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden btn-ghost"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Row 2: Sub Tabs (Category Navigation) */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-5">
          <div className="flex items-center gap-8">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                className={`text-4xl transition-colors relative pb-3 ${
                  activeSubTab === tab.id
                    ? 'text-[var(--foreground)]'
                    : 'text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)]'
                }`}
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                onClick={() => handleSubTabClick(tab.id)}
              >
                {tab.label}
                {activeSubTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--foreground)]" />
                )}
              </button>
            ))}
          </div>

          {/* Contextual Add Button */}
          <button
            onClick={() => setShowAddPosition(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>
              {activeSubTab === 'overview' ? 'Add Position' :
               activeSubTab === 'crypto' ? 'Add Crypto' :
               activeSubTab === 'stocks' ? 'Add Stock' :
               activeSubTab === 'cash' ? 'Add Cash' :
               'Add Other'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 flex">
        {/* Sidebar overlay (mobile) */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`sidebar fixed lg:static left-0 top-0 lg:top-auto h-screen lg:h-auto w-[200px] bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col z-40 ${sidebarOpen ? 'open' : ''}`}>
          {/* Mobile close button */}
          <div className="lg:hidden p-4 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-sm font-medium">Menu</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-[var(--background-secondary)]"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4">
            <div className="space-y-1">
              {sidebarItemsByCategory[activeSubTab].map((item) => {
                const href = buildHref(activeSubTab, item.path);
                const isActive = currentSidebarPage === item.path;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.path}
                    href={href}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
              <div className="w-2 h-2 bg-[var(--positive)] animate-pulse"></div>
              <span>Auto-refresh</span>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>

      {/* Modals */}
      <AddPositionModal
        isOpen={showAddPosition}
        onClose={() => setShowAddPosition(false)}
        defaultTab={
          activeSubTab === 'crypto' ? 'crypto' :
          activeSubTab === 'stocks' ? 'stock' :
          activeSubTab === 'cash' ? 'cash' :
          activeSubTab === 'other' ? 'manual' :
          undefined
        }
      />
      <AddWalletModal
        isOpen={showAddWallet}
        onClose={() => setShowAddWallet(false)}
      />
    </div>
  );
}
