'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Coins,
  Layers,
  Wallet,
  Settings,
  Menu,
  X,
  CandlestickChart,
  Building2,
} from 'lucide-react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Overview' },
  { href: '/positions', icon: Layers, label: 'Portfolio' },
  { href: '/exposure', icon: PieChart, label: 'Exposure' },
  { href: '/perps', icon: CandlestickChart, label: 'Perps' },
  { href: '/performance', icon: TrendingUp, label: 'Performance' },
  { href: '/wallets', icon: Wallet, label: 'Wallets' },
  { href: '/accounts', icon: Building2, label: 'Accounts' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="mobile-menu-btn"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay for mobile */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar fixed left-0 top-0 h-screen w-[220px] bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col z-40 ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[var(--accent-primary)] rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-[15px]">Billion</span>
              <p className="text-[11px] text-[var(--foreground-muted)]">or Zero</p>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-2 hover:bg-[var(--background-secondary)] rounded-lg"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
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
            <div className="w-2 h-2 bg-[var(--positive)] rounded-full animate-pulse"></div>
            <span>Auto-refresh enabled</span>
          </div>
        </div>
      </aside>
    </>
  );
}
