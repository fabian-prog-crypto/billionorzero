/**
 * Maps Ollama tool calls to ParsedPositionAction for the confirmation modal.
 * Extracted from /api/chat/route.ts for testability.
 */

import type { Position, ParsedPositionAction } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionMapperData {
  positions: Position[];
  accounts: { id: string; name: string; connection: { dataSource: string } }[];
}

function resolveDate(input: unknown): string {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (normalized === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    if (normalized === 'tomorrow') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mutation tools that require confirmation via the modal. */
export const CONFIRM_MUTATION_TOOLS = new Set([
  'buy_position', 'sell_partial', 'sell_all', 'remove_position',
  'update_position', 'set_price', 'add_cash', 'update_cash',
]);

/**
 * Find a position by symbol (case-insensitive).
 * Prefers manual position (no accountId) over synced positions.
 */
export function findPositionBySymbol(positions: Position[], symbol: string): Position | undefined {
  const s = symbol.toLowerCase().trim();
  const matches = positions.filter(p => p.symbol.toLowerCase() === s);
  if (matches.length === 0) return undefined;
  return matches.find(p => !p.accountId) || matches[0];
}

// ─── Main Mapper ──────────────────────────────────────────────────────────────

/**
 * Map an Ollama tool call to a ParsedPositionAction for the confirmation modal.
 * Returns null if the tool is not a confirmable mutation.
 */
export function toolCallToAction(toolName: string, args: Record<string, unknown>, db: ActionMapperData): ParsedPositionAction | null {
  if (!CONFIRM_MUTATION_TOOLS.has(toolName)) return null;

  const symbol = String(args.symbol || args.currency || '').toUpperCase();
  const amount = args.amount ? Number(args.amount) : undefined;
  const price = args.price ? Number(args.price) : undefined;

  // Resolve position by symbol for sell/update/remove actions
  const matchedPosition = symbol ? findPositionBySymbol(db.positions, symbol) : undefined;

  // Resolve account by name
  const accountArg = args.account as string | undefined;
  let matchedAccountId: string | undefined;
  let accountName: string | undefined;
  if (accountArg) {
    const match = db.accounts.find(a => a.name.toLowerCase().includes(accountArg.toLowerCase()));
    if (match) {
      matchedAccountId = match.id;
      accountName = match.name;
    } else {
      accountName = accountArg;
    }
  }

  switch (toolName) {
    case 'buy_position': {
      const assetType = String(args.assetType || 'crypto') as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';
      const name = String(args.name || symbol);
      const totalCostArg = args.totalCost ? Number(args.totalCost) : undefined;
      const date = resolveDate(args.date);

      // Derive price from totalCost if provided but price is not
      let resolvedPrice = price;
      let resolvedTotalCost = totalCostArg;
      if (totalCostArg && totalCostArg > 0 && amount && amount > 0 && (!price || price <= 0)) {
        resolvedPrice = totalCostArg / amount;
      }
      if (!resolvedTotalCost && amount && amount > 0 && resolvedPrice && resolvedPrice > 0) {
        resolvedTotalCost = amount * resolvedPrice;
      }

      // Build summary
      let summary: string;
      if (amount && amount > 0) {
        summary = `Buy ${amount} ${symbol}${resolvedPrice ? ` at $${resolvedPrice.toFixed(2)}` : ''}`;
      } else if (resolvedTotalCost && resolvedTotalCost > 0) {
        summary = `Buy $${resolvedTotalCost.toLocaleString()} worth of ${symbol}`;
      } else {
        summary = `Buy ${symbol}`;
      }

      return {
        action: 'buy',
        symbol,
        name,
        assetType,
        amount,
        pricePerUnit: resolvedPrice,
        totalCost: resolvedTotalCost,
        date,
        matchedPositionId: matchedPosition?.id,
        matchedAccountId,
        accountName,
        confidence: 0.9,
        summary,
      };
    }
    case 'sell_partial': {
      const sellAmount = args.amount ? Number(args.amount) : undefined;
      const sellPercent = args.percent ? Number(args.percent) : undefined;
      const date = resolveDate(args.date);
      return {
        action: 'sell_partial',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        sellAmount,
        sellPercent,
        sellPrice: price,
        date,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Sell ${sellAmount ? sellAmount + ' ' : sellPercent ? sellPercent + '% of ' : ''}${symbol}`,
      };
    }
    case 'sell_all': {
      const date = resolveDate(args.date);
      return {
        action: 'sell_all',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        sellPrice: price,
        date,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Sell all ${symbol}`,
      };
    }
    case 'remove_position': {
      return {
        action: 'remove',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Remove ${symbol} from portfolio`,
      };
    }
    case 'update_position': {
      return {
        action: 'update_position',
        symbol,
        assetType: matchedPosition?.type || 'crypto',
        amount,
        costBasis: args.costBasis ? Number(args.costBasis) : undefined,
        date: args.date ? String(args.date) : undefined,
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Update ${symbol} position`,
      };
    }
    case 'set_price': {
      const setSymbol = String(args.symbol || '').toUpperCase();
      return {
        action: 'set_price',
        symbol: setSymbol,
        assetType: 'crypto',
        newPrice: price,
        confidence: 0.9,
        summary: `Set ${setSymbol} price to $${price ?? '?'}`,
      };
    }
    case 'add_cash': {
      const currency = String(args.currency || 'USD').toUpperCase();
      // Try to find an existing cash position for this account+currency combo
      let matchedPosId: string | undefined;
      if (matchedAccountId) {
        const cashPos = db.positions.find(p =>
          p.type === 'cash' && p.accountId === matchedAccountId &&
          (p.symbol.includes(currency) || p.name.toUpperCase().includes(currency))
        );
        if (cashPos) matchedPosId = cashPos.id;
      }
      return {
        action: 'add_cash',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: accountName || accountArg,
        matchedPositionId: matchedPosId,
        matchedAccountId,
        confidence: 0.9,
        summary: `Add ${amount ?? '?'} ${currency}${accountName ? ` to ${accountName}` : ''}`,
      };
    }
    case 'update_cash': {
      const currency = String(args.currency || '').toUpperCase();
      // Find matching cash position
      const cashPositions = db.positions.filter(p => p.type === 'cash');
      let matchedCash: Position | undefined;
      if (accountArg) {
        const account = db.accounts.find(a => a.name.toLowerCase().includes(accountArg.toLowerCase()));
        if (account) {
          matchedCash = cashPositions.find(p => p.accountId === account.id && p.name.toUpperCase().includes(currency));
        }
      }
      if (!matchedCash) {
        matchedCash = cashPositions.find(p => p.name.toUpperCase().includes(currency) || p.symbol.toUpperCase().includes(currency));
      }
      return {
        action: 'update_cash',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: accountName || accountArg,
        matchedPositionId: matchedCash?.id,
        matchedAccountId,
        confidence: 0.9,
        summary: `Update ${currency} balance to ${amount ?? '?'}${accountName ? ` in ${accountName}` : ''}`,
      };
    }
    default:
      return null;
  }
}
