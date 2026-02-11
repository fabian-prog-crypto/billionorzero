/**
 * Cash Account Domain Service
 *
 * Pure business logic for cash account operations:
 * - Slug generation and duplicate detection
 * - Account name extraction from position names
 * - Orphaned position linking (rehydration repair)
 */

import { v4 as uuidv4 } from 'uuid';
import { Position, Account, AssetWithPrice, assetClassFromType } from '@/types';
import { extractCurrencyCode } from './portfolio-calculator';

/** Normalize a name to a stable internal slug for matching. */
export function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

/** Extract account name from a cash position's display name (e.g., "Revolut (EUR)" → "Revolut"). */
export function extractCashAccountName(positionName: string): string {
  const match = positionName.match(/^(.+?)\s*\(/);
  return (match ? match[1].trim() : positionName) || 'Manual';
}

/** Check if a slug derived from `name` already exists in the given accounts list. */
export function isCashAccountSlugTaken(name: string, accounts: Account[]): boolean {
  const slug = toSlug(name);
  return accounts.filter((a) => a.slug).some((a) => a.slug === slug);
}

/**
 * Pure function that links orphaned cash positions to Account entities using slug-based matching.
 *
 * Returns updated `{ positions, accounts }` if any changes were made, or `null` if nothing changed.
 * The caller (store) is responsible for applying the result via setState.
 */
export function linkOrphanedCashPositions(
  positions: Position[],
  accounts: Account[]
): { positions: Position[]; accounts: Account[] } | null {
  // Filter to accounts with slugs (cash-like manual accounts)
  const cashAccounts = accounts.filter((a) => a.slug);
  const updatedAccounts = [...accounts];
  const updatedPositions = [...positions];
  let changed = false;

  // Build lookup: slug → Account id
  const slugToId = new Map<string, string>();
  cashAccounts.forEach((a) => slugToId.set(a.slug!, a.id));

  // Build set of existing account IDs for fast lookup
  const existingIds = new Set(accounts.map((a) => a.id));

  updatedPositions.forEach((p, i) => {
    const effectiveClass = p.assetClass ?? assetClassFromType(p.type);
    if (effectiveClass !== 'cash') return;

    const accountName = extractCashAccountName(p.name);
    const slug = toSlug(accountName);

    if (p.accountId) {
      if (existingIds.has(p.accountId)) {
        // Valid accountId + matching account -> nothing to do
        return;
      }
      // accountId points to missing account -> find by slug or create
      let targetId = slugToId.get(slug);
      if (!targetId) {
        targetId = p.accountId; // Reuse the UUID from accountId
        updatedAccounts.push({
          id: targetId,
          name: accountName,
          isActive: true,
          connection: { dataSource: 'manual' },
          slug,
          addedAt: new Date().toISOString(),
        });
        slugToId.set(slug, targetId);
        existingIds.add(targetId);
      }
      if (targetId !== p.accountId) {
        // Re-point position to the correct account
        updatedPositions[i] = {
          ...p,
          accountId: targetId,
          updatedAt: new Date().toISOString(),
        };
      }
      changed = true;
    } else {
      // No accountId -> find by slug or create, then tag position
      let accountId = slugToId.get(slug);
      if (!accountId) {
        accountId = uuidv4();
        slugToId.set(slug, accountId);
        updatedAccounts.push({
          id: accountId,
          name: accountName,
          isActive: true,
          connection: { dataSource: 'manual' },
          slug,
          addedAt: new Date().toISOString(),
        });
        existingIds.add(accountId);
      }

      updatedPositions[i] = {
        ...p,
        accountId,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }
  });

  if (!changed) return null;

  return {
    positions: updatedPositions,
    accounts: updatedAccounts,
  };
}

/**
 * Aggregate cash positions by currency code.
 *
 * Groups all positions by their extracted currency code (e.g., EUR, USD, CHF),
 * summing amounts and values into a single row per currency.
 * Returns sorted by value descending.
 */
export function aggregateCashByCurrency(positions: AssetWithPrice[]): AssetWithPrice[] {
  if (positions.length === 0) return [];

  const currencyMap = new Map<string, AssetWithPrice>();
  const totalValue = positions
    .filter((p) => p.value > 0)
    .reduce((sum, p) => sum + p.value, 0);

  for (const p of positions) {
    const currency = extractCurrencyCode(p.symbol);
    const existing = currencyMap.get(currency);

    if (existing) {
      const newAmount = existing.amount + p.amount;
      const newValue = existing.value + p.value;
      const newAllocation = totalValue > 0 ? (Math.max(0, newValue) / totalValue) * 100 : 0;
      currencyMap.set(currency, {
        ...existing,
        amount: newAmount,
        value: newValue,
        allocation: newAllocation,
      });
    } else {
      const allocation = totalValue > 0 ? (Math.max(0, p.value) / totalValue) * 100 : 0;
      currencyMap.set(currency, {
        ...p,
        name: currency,
        allocation,
      });
    }
  }

  return Array.from(currencyMap.values()).sort((a, b) => b.value - a.value);
}
