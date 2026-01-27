'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';

interface SortableTableHeaderProps {
  field: string;
  label: string;
  currentField: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

export default function SortableTableHeader({
  field,
  label,
  currentField,
  direction,
  onSort,
  align = 'left',
  className = '',
}: SortableTableHeaderProps) {
  const isActive = currentField === field;
  const alignClass = align === 'right' ? 'justify-end' : 'justify-start';

  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 hover:text-[var(--foreground)] transition-colors ${alignClass} ${className}`}
    >
      <span>{label}</span>
      {isActive ? (
        direction === 'asc' ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )
      ) : (
        <ChevronDown className="w-3.5 h-3.5 opacity-30" />
      )}
    </button>
  );
}

// Helper component for non-sortable headers
export function TableHeader({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';

  return (
    <span className={`${alignClass} ${className}`}>{children}</span>
  );
}
