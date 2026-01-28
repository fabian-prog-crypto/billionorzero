export function formatCurrency(value: number): string {
  // Guard against NaN/undefined/null
  if (value == null || isNaN(value)) return '$0';

  // Handle negative values by formatting absolute value and prepending minus
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const prefix = isNegative ? '-$' : '$';

  // Sub-penny prices: show 4 significant figures
  if (absValue > 0 && absValue < 0.01) {
    return `${prefix}${absValue.toPrecision(4)}`;
  }
  // Sub-dollar prices: show 4 decimals
  if (absValue > 0 && absValue < 1) {
    return `${prefix}${absValue.toFixed(4)}`;
  }
  // Under $10: show 2 decimals
  if (absValue < 10) {
    return `${prefix}${absValue.toFixed(2)}`;
  }
  // $10+: whole numbers with commas
  return `${prefix}${Math.round(absValue).toLocaleString('en-US')}`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  // Guard against NaN/undefined/null
  if (value == null || isNaN(value)) return '0';

  // Handle negative values
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const prefix = isNegative ? '-' : '';

  // For very small values, show more precision
  if (absValue < 0.01 && absValue > 0) {
    return `${prefix}${absValue.toFixed(6)}`;
  }

  // Format with commas, no abbreviations
  return `${prefix}${absValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPercent(value: number, decimals: number = 2): string {
  // Guard against NaN/undefined/null
  if (value == null || isNaN(value)) return '+0.00%';

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getChangeColor(value: number): string {
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-negative';
  return 'text-[var(--foreground-muted)]';
}

export function getChainColor(chain: string): string {
  const colors: Record<string, string> = {
    eth: '#627EEA',
    bsc: '#F3BA2F',
    matic: '#8247E5',
    arb: '#28A0F0',
    op: '#FF0420',
    avax: '#E84142',
    base: '#0052FF',
    sol: '#9945FF',
  };
  return colors[chain.toLowerCase()] || '#6B7280';
}

export function getAssetTypeLabel(type: string): string {
  switch (type) {
    case 'crypto':
      return 'Crypto';
    case 'stock':
      return 'Stock';
    case 'cash':
      return 'Cash';
    case 'manual':
      return 'Manual';
    default:
      return type;
  }
}
