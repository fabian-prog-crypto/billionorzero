'use client';

import { ReactNode } from 'react';
import { Search, Download, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  color: string;
}

export interface ViewTab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface PageHeaderProps {
  title: string;
  value: number;
  hideBalances?: boolean;
  tabs?: ViewTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  filterOptions?: FilterOption<string>[];
  selectedFilters?: Set<string>;
  onFilterToggle?: (value: string) => void;
  onFilterClear?: () => void;
  filteredTotal?: number;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  hideDust?: boolean;
  onToggleHideDust?: () => void;
  onExport?: () => void;
  actions?: ReactNode;
  secondaryStats?: { label: string; value: string }[];
}

export default function PageHeader({
  title,
  value,
  hideBalances = false,
  tabs,
  activeTab,
  onTabChange,
  filterOptions,
  selectedFilters,
  onFilterToggle,
  onFilterClear,
  filteredTotal,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  hideDust,
  onToggleHideDust,
  onExport,
  actions,
  secondaryStats,
}: PageHeaderProps) {
  const hasFilters = filterOptions && filterOptions.length > 0 && onFilterToggle;
  const hasActiveFilter = selectedFilters && selectedFilters.size > 0 && selectedFilters.size < (filterOptions?.length || 0);
  const displayValue = hasActiveFilter && filteredTotal !== undefined ? filteredTotal : value;

  return (
    <div className="card mb-4">
      {/* Main Value Section */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-semibold">
            {hideBalances ? '••••••••' : formatCurrency(displayValue)}
          </p>
          {hasActiveFilter && filteredTotal !== undefined && (
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              of {formatCurrency(value)} total
            </p>
          )}
        </div>
        {secondaryStats && (
          <div className="text-right text-sm text-[var(--foreground-muted)]">
            {secondaryStats.map((stat, i) => (
              <p key={i}>{stat.label}: {hideBalances ? '•••' : stat.value}</p>
            ))}
          </div>
        )}
      </div>

      {/* Category Filters */}
      {hasFilters && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1 p-1 bg-[var(--background-secondary)]">
            {filterOptions.map((opt) => {
              const isSelected = selectedFilters?.has(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => onFilterToggle(opt.value)}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span
                    className="w-2 h-2"
                    style={{ backgroundColor: opt.color }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {hasActiveFilter && onFilterClear && (
            <button
              onClick={onFilterClear}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-3 h-3" />
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Tabs + Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        {tabs && tabs.length > 0 && onTabChange && (
          <div className="flex gap-1 p-1 bg-[var(--background-secondary)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span className="text-xs opacity-60">({tab.count})</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Hide Dust Toggle */}
        {onToggleHideDust !== undefined && (
          <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={hideDust}
              onChange={() => onToggleHideDust()}
              className="w-4 h-4 border-[var(--border)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
            />
            Hide dust
          </label>
        )}

        {/* Search */}
        {onSearchChange && (
          <div className="relative" style={{ width: '120px' }}>
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="search-input w-full"
            />
          </div>
        )}

        {/* Export */}
        {onExport && (
          <button onClick={onExport} className="btn btn-secondary p-2" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
        )}

        {/* Custom Actions */}
        {actions}
      </div>
    </div>
  );
}
