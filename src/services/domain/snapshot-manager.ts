/**
 * Snapshot Manager - Domain Service
 * Handles daily portfolio snapshots for historical tracking
 */

import { Position, PriceData, NetWorthSnapshot } from '@/types';
import { calculatePortfolioSummary } from './portfolio-calculator';

/**
 * Create a daily snapshot of portfolio value
 */
export function createDailySnapshot(
  positions: Position[],
  prices: Record<string, PriceData>
): Omit<NetWorthSnapshot, 'id'> {
  const summary = calculatePortfolioSummary(positions, prices);

  return {
    date: new Date().toISOString().split('T')[0],
    totalValue: summary.totalValue,
    cryptoValue: summary.cryptoValue,
    stockValue: summary.stockValue,
    cashValue: summary.cashValue,
    manualValue: summary.manualValue,
  };
}

/**
 * Check if we should take a new daily snapshot
 * Returns true if no snapshot exists for today
 */
export function shouldTakeSnapshot(snapshots: NetWorthSnapshot[]): boolean {
  if (snapshots.length === 0) return true;

  const today = new Date().toISOString().split('T')[0];
  const lastSnapshot = snapshots[snapshots.length - 1];

  return lastSnapshot.date !== today;
}

/**
 * Get snapshots within a date range
 */
export function getSnapshotsInRange(
  snapshots: NetWorthSnapshot[],
  startDate: string,
  endDate: string
): NetWorthSnapshot[] {
  return snapshots.filter(
    (s) => s.date >= startDate && s.date <= endDate
  );
}

/**
 * Calculate performance metrics between two snapshots
 */
export function calculatePerformance(
  startSnapshot: NetWorthSnapshot,
  endSnapshot: NetWorthSnapshot
): {
  absoluteChange: number;
  percentChange: number;
  cryptoChange: number;
  stockChange: number;
} {
  const absoluteChange = endSnapshot.totalValue - startSnapshot.totalValue;
  const percentChange =
    startSnapshot.totalValue > 0
      ? (absoluteChange / startSnapshot.totalValue) * 100
      : 0;

  return {
    absoluteChange,
    percentChange,
    cryptoChange: endSnapshot.cryptoValue - startSnapshot.cryptoValue,
    stockChange: endSnapshot.stockValue - startSnapshot.stockValue,
  };
}

/**
 * Get snapshots for common time periods
 */
export function getSnapshotsByPeriod(
  snapshots: NetWorthSnapshot[],
  period: '7d' | '30d' | '90d' | '1y' | 'all'
): NetWorthSnapshot[] {
  if (period === 'all') return snapshots;

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
  }

  const startDateStr = startDate.toISOString().split('T')[0];
  return snapshots.filter((s) => s.date >= startDateStr);
}
