'use client';

import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  icon?: ReactNode;
  className?: string;
}

export default function MetricCard({
  label,
  value,
  subValue,
  color,
  icon,
  className = '',
}: MetricCardProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-1">
        {color && (
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        {icon && <div className="w-4 h-4 text-[var(--foreground-muted)]">{icon}</div>}
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
          {label}
        </p>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {subValue && (
        <p className="text-[13px] text-[var(--foreground-muted)] mt-0.5">{subValue}</p>
      )}
    </div>
  );
}
