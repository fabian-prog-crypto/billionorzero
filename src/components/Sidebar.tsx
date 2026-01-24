'use client';

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
  Search,
} from 'lucide-react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Overview' },
  { href: '/positions', icon: Layers, label: 'Portfolio' },
  { href: '/exposure', icon: PieChart, label: 'Exposure' },
  { href: '/performance', icon: TrendingUp, label: 'Performance' },
  { href: '/wallets', icon: Wallet, label: 'Wallets' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col z-40">
      {/* Logo */}
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[var(--accent-primary)] rounded-lg flex items-center justify-center">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-semibold text-[15px]">Billion</span>
            <p className="text-[11px] text-[var(--foreground-muted)]">or Zero</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--background)] rounded-lg text-[var(--foreground-muted)] text-sm">
          <Search className="w-4 h-4" />
          <span>Search</span>
          <span className="ml-auto text-xs bg-[var(--tag-bg)] px-1.5 py-0.5 rounded">⌘K</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
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
  );
}
