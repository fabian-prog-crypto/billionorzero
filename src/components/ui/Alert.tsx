'use client';

import { ReactNode } from 'react';
import { Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

type AlertType = 'info' | 'warning' | 'error' | 'success';

interface AlertProps {
  type?: AlertType;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const typeStyles: Record<AlertType, { bg: string; border: string; iconColor: string; textColor: string }> = {
  info: {
    bg: 'bg-[var(--background-secondary)]',
    border: 'border-[var(--border)]',
    iconColor: 'text-[var(--foreground-muted)]',
    textColor: 'text-[var(--foreground-muted)]',
  },
  warning: {
    bg: 'bg-[var(--warning-light)]',
    border: 'border-[rgba(201,176,123,0.2)]',
    iconColor: 'text-[var(--warning)]',
    textColor: 'text-[var(--foreground-muted)]',
  },
  error: {
    bg: 'bg-[var(--negative-light)]',
    border: 'border-[rgba(201,123,123,0.2)]',
    iconColor: 'text-[var(--negative)]',
    textColor: 'text-[var(--foreground-muted)]',
  },
  success: {
    bg: 'bg-[var(--positive-light)]',
    border: 'border-[rgba(124,185,139,0.2)]',
    iconColor: 'text-[var(--positive)]',
    textColor: 'text-[var(--foreground-muted)]',
  },
};

const defaultIcons: Record<AlertType, ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
  success: <CheckCircle className="w-4 h-4" />,
};

export default function Alert({
  type = 'info',
  icon,
  children,
  className = '',
}: AlertProps) {
  const styles = typeStyles[type];
  const displayIcon = icon ?? defaultIcons[type];

  return (
    <div
      className={`p-3 ${styles.bg} border ${styles.border} flex items-start gap-2 ${className}`}
    >
      <div className={`${styles.iconColor} mt-0.5 shrink-0`}>
        {displayIcon}
      </div>
      <div className={`text-xs ${styles.textColor}`}>
        {children}
      </div>
    </div>
  );
}
