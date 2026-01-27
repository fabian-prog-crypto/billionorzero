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
  lg: 'py-32',
};

const iconContainerSizes = {
  sm: 'w-16 h-16',
  md: 'w-16 h-16',
  lg: 'w-20 h-20',
};

const iconSizes = {
  sm: 'w-8 h-8',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
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
      <div className={`${iconContainerSizes[size]} rounded-2xl bg-[var(--background-tertiary)] flex items-center justify-center mb-6`}>
        <div className={`${iconSizes[size]} text-[var(--foreground-muted)]`}>
          {icon}
        </div>
      </div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-[var(--foreground-muted)] text-center max-w-md mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}
