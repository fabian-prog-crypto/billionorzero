'use client';

import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

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
      className={`flex items-center gap-1 w-full hover:text-[var(--foreground)] transition-colors ${alignClass} ${className}`}
    >
      <span>{label}</span>
      {isActive ? (
        direction === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

