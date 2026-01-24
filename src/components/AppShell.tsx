'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, RefreshCw, Eye, EyeOff, Settings, Wallet, Sun, Moon, Menu, X, PieChart, TrendingUp, Layers, CandlestickChart, Building2 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useThemeStore, applyTheme } from '@/store/themeStore';
import { useRefresh } from '@/components/PortfolioProvider';
import AddPositionModal from '@/components/modals/AddPositionModal';
import AddWalletModal from '@/components/modals/AddWalletModal';

type MainTab = 'portfolio' | 'insights';
type SubTab = 'overview' | 'crypto' | 'stocks' | 'cash' | 'other';

const sidebarItems = [
  { href: '/positions', icon: Layers, label: 'Positions' },
  { href: '/exposure', icon: PieChart, label: 'Exposure' },
  { href: '/perps', icon: CandlestickChart, label: 'Perps' },
  { href: '/performance', icon: TrendingUp, label: 'Performance' },
  { href: '/wallets', icon: Wallet, label: 'Wallets' },
  { href: '/accounts', icon: Building2, label: 'Accounts' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

const subTabs: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'crypto', label: 'CRYPTO' },
  { id: 'stocks', label: 'STOCKS' },
  { id: 'cash', label: 'CASH' },
  { id: 'other', label: 'OTHERS' },
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

  const { hideBalances, toggleHideBalances } = usePortfolioStore();
  const { theme, setTheme } = useThemeStore();
  const { refresh, isRefreshing } = useRefresh();

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
      {/* Top Header with Main Tabs */}
      <header className="border-b border-[var(--border)] bg-[var(--background)]">
        <div className="flex items-center justify-between px-6 lg:px-8">
          {/* Left: Logo + Main Tabs */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/" className="flex items-center py-4">
              <span className="text-base tracking-tight font-semibold" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                billionorzero
              </span>
            </Link>

            {/* Main Tabs */}
            <nav className="top-tabs border-none mb-0">
              <button
                className="top-tab active"
                onClick={() => router.push('/')}
              >
                Portfolio
              </button>
              <button
                className="top-tab disabled"
                disabled
              >
                Market Insights
                <span className="coming-soon">Soon</span>
              </button>
            </nav>
          </div>

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

            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="btn-ghost"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowAddWallet(true)}
              className="btn-ghost"
              title="Add Wallet"
            >
              <Wallet className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowAddPosition(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

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

        {/* Sub Tabs - Category Navigation */}
        <div className="px-6 lg:px-8 border-t border-[var(--border)]">
          <div className="sub-tabs">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                className={`sub-tab ${activeSubTab === tab.id ? 'active' : ''}`}
                onClick={() => handleSubTabClick(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
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
              {sidebarItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
      />
      <AddWalletModal
        isOpen={showAddWallet}
        onClose={() => setShowAddWallet(false)}
      />
    </div>
  );
}
