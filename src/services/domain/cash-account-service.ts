/**
 * Cash Account Domain Service
 *
 * Pure business logic for cash account operations:
 * - Slug generation and duplicate detection
 * - Account name extraction from position names
 * - Orphaned position linking (rehydration repair)
 */

import { v4 as uuidv4 } from 'uuid';
import { Position, CashAccount, AssetWithPrice } from '@/types';
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
export function isCashAccountSlugTaken(name: string, accounts: CashAccount[]): boolean {
  const slug = toSlug(name);
  return accounts.some((a) => a.slug === slug);
}

/**
 * Pure function that links orphaned cash positions to CashAccount entities using slug-based matching.
 *
 * Returns updated `{ positions, cashAccounts }` if any changes were made, or `null` if nothing changed.
 * The caller (store) is responsible for applying the result via setState.
 */
export function linkOrphanedCashPositions(
  positions: Position[],
  cashAccounts: CashAccount[]
): { positions: Position[]; cashAccounts: CashAccount[] } | null {
  const updatedCashAccounts = [...cashAccounts];
  const updatedPositions = [...positions];
  let changed = false;

  // Build lookup: slug → CashAccount id
  const slugToId = new Map<string, string>();
  updatedCashAccounts.forEach((a) => slugToId.set(a.slug, a.id));

  // Build set of existing account IDs for fast lookup
  const existingIds = new Set(updatedCashAccounts.map((a) => a.id));

  updatedPositions.forEach((p, i) => {
    if (p.type !== 'cash') return;

    const protocol = p.protocol || '';
    const protoMatch = protocol.match(/^cash-account:(.+)$/);
    const accountName = extractCashAccountName(p.name);
    const slug = toSlug(accountName);

    if (protoMatch) {
      const accountId = protoMatch[1];
      if (existingIds.has(accountId)) {
        // Valid protocol + matching account → nothing to do
        return;
      }
      // Protocol points to missing account → find by slug or create
      let targetId = slugToId.get(slug);
      if (!targetId) {
        targetId = accountId; // Reuse the UUID from protocol
        updatedCashAccounts.push({
          id: targetId,
          slug,
          name: accountName,
          isActive: true,
          addedAt: new Date().toISOString(),
        });
        slugToId.set(slug, targetId);
        existingIds.add(targetId);
      }
      if (targetId !== accountId) {
        // Re-point position to the correct account
        updatedPositions[i] = {
          ...p,
          protocol: `cash-account:${targetId}`,
          updatedAt: new Date().toISOString(),
        };
      }
      changed = true;
    } else {
      // No protocol → find by slug or create, then tag position
      let accountId = slugToId.get(slug);
      if (!accountId) {
        accountId = uuidv4();
        slugToId.set(slug, accountId);
        updatedCashAccounts.push({
          id: accountId,
          slug,
          name: accountName,
          isActive: true,
          addedAt: new Date().toISOString(),
        });
        existingIds.add(accountId);
      }

      updatedPositions[i] = {
        ...p,
        protocol: `cash-account:${accountId}`,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }
  });

  if (!changed) return null;

  return {
    positions: updatedPositions,
    cashAccounts: updatedCashAccounts,
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
