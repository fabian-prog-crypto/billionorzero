'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, RefreshCw, Eye, EyeOff, Settings, Wallet, Sun, Moon, Menu, X, PieChart, TrendingUp, Layers, CandlestickChart, Building2, LayoutDashboard, MessageSquare } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useThemeStore, applyTheme } from '@/store/themeStore';
import { useRefresh } from '@/components/PortfolioProvider';
import AddPositionModal from '@/components/modals/AddPositionModal';
import AddWalletModal from '@/components/modals/AddWalletModal';
import CommandPalette from '@/components/CommandPalette';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import { calculateAllPositionsWithPrices } from '@/services';
import { calculateSyncCost } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { ParsedPositionAction } from '@/types';

type MainTab = 'portfolio' | 'insights';
type SubTab = 'overview' | 'crypto' | 'equities' | 'cash' | 'other';

// Sidebar items per category (paths are relative, will be prefixed with category)
// Empty path '' means category root (e.g., /crypto for crypto category)
const sidebarItemsByCategory: Record<SubTab, { path: string; icon: typeof Layers; label: string }[]> = {
  overview: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Assets' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
    { path: 'performance', icon: TrendingUp, label: 'Performance' },
  ],
  crypto: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'assets', icon: Layers, label: 'Assets' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
    { path: 'perps', icon: CandlestickChart, label: 'Perps' },
    { path: 'wallets', icon: Wallet, label: 'Wallets' },
    { path: 'accounts', icon: Building2, label: 'Accounts' },
  ],
  equities: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Assets' },
    { path: 'exposure', icon: PieChart, label: 'Exposure' },
    { path: 'accounts', icon: Building2, label: 'Accounts' },
  ],
  cash: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Assets' },
  ],
  other: [
    { path: '', icon: LayoutDashboard, label: 'Overview' },
    { path: 'positions', icon: Layers, label: 'Assets' },
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
  { id: 'equities', label: 'Equities' },
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
  const [mounted, setMounted] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [nlAction, setNlAction] = useState<ParsedPositionAction | null>(null);
  const [showNlConfirm, setShowNlConfirm] = useState(false);

  // Track client-side mount to avoid hydration mismatch with dates
  useEffect(() => {
    setMounted(true);
  }, []);

  const { hideBalances, toggleHideBalances, wallets, lastRefresh, positions, prices, customPrices } = usePortfolioStore();
  const { theme, setTheme } = useThemeStore();
  const { refresh, isRefreshing } = useRefresh();

  const allPositionsWithPrices = useMemo(() => {
    return calculateAllPositionsWithPrices(positions, prices, customPrices);
  }, [positions, prices, customPrices]);

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

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Determine active sub-tab from pathname
  const getActiveSubTab = (): SubTab => {
    if (pathname.startsWith('/crypto')) return 'crypto';
    if (pathname.startsWith('/equities')) return 'equities';
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
  const isPortfolioPage = pathname === '/' || pathname === '/crypto' || pathname === '/equities' || pathname === '/cash' || pathname === '/other';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <header className="bg-[var(--background)]">
        {/* Row 1: Main Navigation */}
        <div className="flex items-center justify-between px-6 lg:px-8 border-b border-[var(--border)]">
          {/* Logo */}
          <Link href="/" className="flex items-center py-3">
            <span className="text-base tracking-tight" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              billionorzero
            </span>
          </Link>

          {/* Right: Updated + Actions */}
          <div className="flex items-center gap-1">
            {mounted && (
              <span className="text-[10px] text-[var(--foreground-muted)] mr-2 hidden sm:inline">
                {lastRefresh
                  ? `Updated ${formatDistanceToNow(new Date(lastRefresh))} ago`
                  : 'Not synced'}
              </span>
            )}

            <button
              onClick={toggleTheme}
              className="btn-ghost p-1.5"
              title={effectiveTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {effectiveTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={toggleHideBalances}
              className="btn-ghost p-1.5"
              title={hideBalances ? 'Show balances' : 'Hide balances'}
            >
              {hideBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            <div className="relative group">
              <button
                onClick={refresh}
                disabled={isRefreshing}
                className="btn-ghost p-1.5"
                title="Sync"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              {walletCount > 0 && (
                <div className="tooltip">
                  ~${syncCost.costPerSync.toFixed(3)}/sync · ${syncCost.monthlyCost.toFixed(2)}/mo
                </div>
              )}
            </div>

            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="btn-ghost p-1.5 flex items-center gap-1"
              title="Command palette (⌘K)"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-[10px] text-[var(--foreground-subtle)] border border-[var(--border)] px-1 py-0.5 hidden sm:inline">⌘K</span>
            </button>

            <button
              onClick={() => setShowAddWallet(true)}
              className="btn-ghost p-1.5"
              title="Add Wallet"
            >
              <Wallet className="w-4 h-4" />
            </button>

            <Link
              href="/settings"
              className="btn-ghost p-1.5"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden btn-ghost p-1.5"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 2: Sub Tabs (Category Navigation) */}
        <div className="flex items-center justify-between px-6 lg:px-8 pt-5 pb-4">
          <div className="flex items-baseline gap-7">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                className={`transition-colors relative pb-2 ${
                  activeSubTab !== tab.id ? 'hover:text-[var(--foreground-muted)]' : ''
                }`}
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: '28px',
                  lineHeight: '1.2',
                  fontWeight: activeSubTab === tab.id ? 500 : 400,
                  color: activeSubTab === tab.id ? 'var(--foreground)' : '#B5B5B5',
                }}
                onClick={() => handleSubTabClick(tab.id)}
              >
                {tab.label}
                {activeSubTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[var(--foreground)]" />
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
            <span>Add {activeSubTab === 'overview' ? 'Position' : subTabs.find(t => t.id === activeSubTab)?.label || 'Position'}</span>
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
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
              <div className="w-2 h-2 bg-[var(--foreground-muted)]"></div>
              <span>Manual sync</span>
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
          activeSubTab === 'equities' ? 'stock' :
          activeSubTab === 'cash' ? 'cash' :
          activeSubTab === 'other' ? 'manual' :
          undefined
        }
      />
      <AddWalletModal
        isOpen={showAddWallet}
        onClose={() => setShowAddWallet(false)}
      />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onParsed={(action) => {
          setCommandPaletteOpen(false);
          setNlAction(action);
          setShowNlConfirm(true);
        }}
        positions={positions}
      />
      {nlAction && (
        <ConfirmPositionActionModal
          isOpen={showNlConfirm}
          onClose={() => {
            setShowNlConfirm(false);
            setNlAction(null);
          }}
          parsedAction={nlAction}
          positions={positions}
          positionsWithPrices={allPositionsWithPrices}
        />
      )}
    </div>
  );
}
