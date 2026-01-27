'use client';

import { X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
  color?: string;
  parent?: string;
  isSubcategory?: boolean;
}

interface FilterChipsProps {
  options: FilterOption[];
  selected: string;
  onChange: (value: string) => void;
  showClear?: boolean;
  onClear?: () => void;
  variant?: 'default' | 'compact';
  className?: string;
}

export default function FilterChips({
  options,
  selected,
  onChange,
  showClear = false,
  onClear,
  variant = 'default',
  className = '',
}: FilterChipsProps) {
  const isCompact = variant === 'compact';

  const baseClasses = isCompact
    ? 'px-2.5 py-1 text-xs'
    : 'px-3 py-1.5 text-sm';

  const dotSize = isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((opt) => {
        const isActive = selected === opt.value;

        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`${baseClasses} font-medium rounded-full border transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                : 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--foreground-muted)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {opt.color && (
              <span
                className={`${dotSize} rounded-full`}
                style={{ backgroundColor: isActive ? 'white' : opt.color }}
              />
            )}
            {opt.label}
          </button>
        );
      })}

      {showClear && selected !== 'all' && onClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}
