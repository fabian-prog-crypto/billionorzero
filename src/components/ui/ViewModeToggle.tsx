'use client';

import { ReactNode } from 'react';

interface ViewMode {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface ViewModeToggleProps {
  modes: ViewMode[];
  activeMode: string;
  onChange: (mode: string) => void;
  className?: string;
}

export default function ViewModeToggle({
  modes,
  activeMode,
  onChange,
  className = '',
}: ViewModeToggleProps) {
  return (
    <div className={`flex gap-1 p-1 bg-[var(--background-secondary)] ${className}`}>
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeMode === mode.id
              ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
              : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
          }`}
        >
          {mode.icon}
          {mode.label}
          {mode.count !== undefined && (
            <span className="text-xs opacity-60">({mode.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
