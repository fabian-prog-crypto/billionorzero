'use client';

import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative w-full sm:w-[160px] max-w-full ${className}`}>
      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground-muted)]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="search-input w-full"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[var(--background-secondary)]"
        >
          <X className="w-2.5 h-2.5 text-[var(--foreground-muted)]" />
        </button>
      )}
    </div>
  );
}
