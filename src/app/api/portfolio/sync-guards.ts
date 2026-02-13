/**
 * Guards that prevent accidental data loss when syncing portfolio state.
 *
 * These are the last line of defense against partial syncs, API failures,
 * or bugs that would overwrite a populated database with incomplete data.
 */

import type { PortfolioData } from './db-store';

/** Minimum ratio of incoming/existing positions allowed (50%) */
const POSITION_DROP_THRESHOLD = 0.5;

/** Minimum existing positions before threshold guard kicks in */
const THRESHOLD_MIN_EXISTING = 10;

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Guard 1: Total wipe protection.
 * Rejects if incoming state has 0 positions but existing db has data.
 */
export function guardTotalWipe(existing: PortfolioData, incoming: PortfolioData): GuardResult {
  if (
    existing.positions.length > 0 &&
    incoming.positions.length === 0 &&
    incoming.accounts.length === 0
  ) {
    return {
      allowed: false,
      reason: `Refusing to wipe database: incoming state has 0 positions and 0 accounts but existing db has ${existing.positions.length} positions.`,
    };
  }
  return { allowed: true };
}

/**
 * Guard 2: Partial data loss protection.
 * Rejects if incoming positions are less than 50% of existing positions.
 * Only triggers when existing db has at least THRESHOLD_MIN_EXISTING positions.
 */
export function guardPartialLoss(existing: PortfolioData, incoming: PortfolioData): GuardResult {
  if (existing.positions.length < THRESHOLD_MIN_EXISTING) {
    return { allowed: true };
  }

  const ratio = incoming.positions.length / existing.positions.length;
  if (ratio < POSITION_DROP_THRESHOLD) {
    return {
      allowed: false,
      reason: `Refusing to sync: position count would drop from ${existing.positions.length} to ${incoming.positions.length} (${Math.round(ratio * 100)}% remaining). This looks like a partial sync failure. Threshold: ${Math.round(POSITION_DROP_THRESHOLD * 100)}%.`,
    };
  }
  return { allowed: true };
}

/**
 * Guard 3: Debt position preservation.
 * Rejects if existing db has debt positions but incoming has none.
 * Debt positions (borrowed assets) represent real liabilities and must never silently vanish.
 */
export function guardDebtLoss(existing: PortfolioData, incoming: PortfolioData): GuardResult {
  const existingDebts = existing.positions.filter(p => p.isDebt);
  const incomingDebts = incoming.positions.filter(p => p.isDebt);

  if (existingDebts.length > 0 && incomingDebts.length === 0) {
    return {
      allowed: false,
      reason: `Refusing to sync: all ${existingDebts.length} debt positions would be lost. Debt positions represent real liabilities and must not silently disappear.`,
    };
  }
  return { allowed: true };
}

/**
 * Run all sync guards. Returns the first failure, or { allowed: true }.
 */
export function runSyncGuards(existing: PortfolioData, incoming: PortfolioData): GuardResult {
  const guards = [guardTotalWipe, guardPartialLoss, guardDebtLoss];

  for (const guard of guards) {
    const result = guard(existing, incoming);
    if (!result.allowed) {
      return result;
    }
  }

  return { allowed: true };
}
