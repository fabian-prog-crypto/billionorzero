'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'py-12',
  md: 'py-16',
  lg: 'py-20',
};

const iconContainerSizes = {
  sm: 'w-12 h-12',
  md: 'w-14 h-14',
  lg: 'w-14 h-14',
};

const iconSizes = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-6 h-6',
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'lg',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${sizeClasses[size]}`}>
      <div className={`${iconContainerSizes[size]} bg-[var(--background-secondary)] flex items-center justify-center mb-4`}>
        <div className={`${iconSizes[size]} text-[var(--foreground-muted)]`}>
          {icon}
        </div>
      </div>
      <h2 className="text-[15px] font-semibold mb-2">{title}</h2>
      <p className="text-[13px] text-[var(--foreground-muted)] text-center max-w-md mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}
