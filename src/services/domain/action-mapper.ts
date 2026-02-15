/**
 * Maps Ollama tool calls to ParsedPositionAction for the confirmation modal.
 * Extracted from /api/chat/route.ts for testability.
 */

import type { Position, ParsedPositionAction } from '@/types';
import { getEffectiveAssetClass } from './account-role-service';
import { resolveAccountFromArgs } from './command-account-resolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionMapperData {
  positions: Position[];
  accounts: { id: string; name: string; connection: { dataSource: string } }[];
  prices?: Record<string, { price?: number }>;
  customPrices?: Record<string, { price?: number }>;
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
  'update_position', 'set_price', 'add_cash',
]);

const SYMBOL_ALIASES: Record<string, string[]> = {
  GOOG: ['GOOGL'],
  GOOGL: ['GOOG'],
  FB: ['META'],
  META: ['FB'],
  'BRK.B': ['BRK-B'],
  'BRK-B': ['BRK.B'],
};

function canonicalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function uniqueSymbols(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map((s) => s.toUpperCase())));
}

function preferredMatch(matches: Position[]): Position | undefined {
  if (matches.length === 0) return undefined;
  return matches.find((p) => !p.accountId) || matches[0];
}

function findSellCandidatesBySymbol(positions: Position[], symbol: string): Position[] {
  const requested = symbol.toUpperCase().trim();
  if (!requested) return [];

  const exactMatches = positions.filter((p) => p.symbol.toUpperCase() === requested);
  if (exactMatches.length > 0) return exactMatches;

  const aliases = SYMBOL_ALIASES[requested] || [];
  const aliasMatches = aliases.flatMap((alias) =>
    positions.filter((p) => p.symbol.toUpperCase() === alias)
  );
  if (aliasMatches.length > 0) return aliasMatches;

  const canonical = canonicalizeSymbol(requested);
  if (canonical) {
    const canonicalMatches = positions.filter((p) => canonicalizeSymbol(p.symbol) === canonical);
    if (canonicalMatches.length > 0) return canonicalMatches;
  }

  return [];
}

function resolveSellPositionMatch(
  positions: Position[],
  symbol: string,
  preferredAccountId?: string,
): Position | undefined {
  const candidates = findSellCandidatesBySymbol(positions, symbol);
  if (candidates.length === 0) {
    return findPositionBySymbol(positions, symbol);
  }

  if (preferredAccountId) {
    const inAccount = candidates.filter((p) => p.accountId === preferredAccountId);
    if (inAccount.length === 1) return inAccount[0];
  }

  // For equity sells, prefer an account-linked position so settlement can update that account's cash.
  const equityLinked = candidates.filter((p) => {
    if (!p.accountId) return false;
    const effectiveClass = getEffectiveAssetClass(p);
    return p.type === 'stock' || p.type === 'etf' || effectiveClass === 'equity' || effectiveClass === 'metals';
  });
  if (equityLinked.length === 1) return equityLinked[0];

  const linked = candidates.filter((p) => !!p.accountId);
  if (linked.length === 1) return linked[0];

  return preferredMatch(candidates);
}

function getPriceFromMap(map: Record<string, { price?: number }> | undefined, key: string): number | undefined {
  if (!map) return undefined;
  const direct = map[key]?.price;
  if (typeof direct === 'number' && direct > 0) return direct;
  const lower = map[key.toLowerCase()]?.price;
  if (typeof lower === 'number' && lower > 0) return lower;
  const upper = map[key.toUpperCase()]?.price;
  if (typeof upper === 'number' && upper > 0) return upper;
  return undefined;
}

function inferSellPrice(db: ActionMapperData, symbol: string, matchedPosition?: Position): number | undefined {
  const candidates = uniqueSymbols([
    matchedPosition?.symbol || '',
    symbol,
  ].filter(Boolean));

  for (const candidate of candidates) {
    const customPrice = getPriceFromMap(db.customPrices, candidate);
    if (customPrice) return customPrice;
    const marketPrice = getPriceFromMap(db.prices, candidate);
    if (marketPrice) return marketPrice;
  }
  return undefined;
}

function extractCurrencyFromCashPosition(position: Position): string | null {
  const symbolMatch = position.symbol.toUpperCase().match(/CASH_([A-Z]{3})/);
  if (symbolMatch?.[1]) return symbolMatch[1];

  const nameMatch = position.name.toUpperCase().match(/\(([A-Z]{3})\)/);
  if (nameMatch?.[1]) return nameMatch[1];

  return null;
}

function normalizeCashCurrencyCode(input: string): string {
  const normalized = input.toUpperCase().trim();
  if (!normalized) return '';

  const fromCashSymbol = normalized.match(/CASH_([A-Z]{3})/);
  if (fromCashSymbol?.[1]) return fromCashSymbol[1];

  if (/^[A-Z]{3}$/.test(normalized)) return normalized;

  return '';
}

function resolveCashUpdateMatch(
  positions: Position[],
  currencyLike: string,
  accountId?: string,
): Position | undefined {
  const currency = normalizeCashCurrencyCode(currencyLike);
  if (!currency) return undefined;

  const cashPositions = positions.filter((p) => p.type === 'cash');
  const matchesByCurrency = cashPositions.filter(
    (p) => extractCurrencyFromCashPosition(p) === currency
  );
  if (accountId) {
    const inAccount = matchesByCurrency.filter((p) => p.accountId === accountId);
    return inAccount.length === 1 ? inAccount[0] : undefined;
  }
  return matchesByCurrency.length === 1 ? matchesByCurrency[0] : undefined;
}

/**
 * Find a position by symbol (case-insensitive).
 * Prefers manual position (no accountId) over synced positions.
 */
export function findPositionBySymbol(positions: Position[], symbol: string): Position | undefined {
  const requested = symbol.toUpperCase().trim();
  if (!requested) return undefined;

  // 1) Exact symbol match first.
  const exactMatches = positions.filter((p) => p.symbol.toUpperCase() === requested);
  if (exactMatches.length > 0) return preferredMatch(exactMatches);

  // 2) Known alias mapping (GOOG <-> GOOGL, etc.).
  const aliases = SYMBOL_ALIASES[requested] || [];
  for (const alias of aliases) {
    const aliasMatches = positions.filter((p) => p.symbol.toUpperCase() === alias);
    if (aliasMatches.length > 0) return preferredMatch(aliasMatches);
  }

  // 3) Canonical punctuation-insensitive match (e.g. BRK.B vs BRK-B).
  const canonical = canonicalizeSymbol(requested);
  if (canonical) {
    const canonicalMatches = positions.filter((p) => canonicalizeSymbol(p.symbol) === canonical);
    if (canonicalMatches.length > 0) return preferredMatch(canonicalMatches);
  }

  // 4) Unique prefix fallback for longer symbols only.
  if (requested.length >= 4) {
    const prefixMatches = positions.filter((p) => p.symbol.toUpperCase().startsWith(requested));
    if (prefixMatches.length === 1) return prefixMatches[0];
  }

  return undefined;
}

// ─── Main Mapper ──────────────────────────────────────────────────────────────

/**
 * Map an Ollama tool call to a ParsedPositionAction for the confirmation modal.
 * Returns null if the tool is not a confirmable mutation.
 */
export function toolCallToAction(toolName: string, args: Record<string, unknown>, db: ActionMapperData): ParsedPositionAction | null {
  if (!CONFIRM_MUTATION_TOOLS.has(toolName) && toolName !== 'update_cash') return null;

  const symbol = String(args.symbol || args.currency || '').toUpperCase();
  const amount = args.amount ? Number(args.amount) : undefined;
  const price = args.price ? Number(args.price) : undefined;

  // Resolve position by symbol for sell/update/remove actions
  const matchedPosition = symbol ? findPositionBySymbol(db.positions, symbol) : undefined;
  const resolvedSymbol = matchedPosition?.symbol.toUpperCase() || symbol;

  // Resolve account by name
  const accountResolution = resolveAccountFromArgs(db.accounts, args);
  const accountArg = accountResolution.input;
  let matchedAccountId: string | undefined;
  let accountName: string | undefined;
  if (accountResolution.status === 'matched' && accountResolution.account) {
    matchedAccountId = accountResolution.account.id;
    accountName = accountResolution.account.name;
  } else if (accountArg) {
    accountName = accountArg;
  }

  switch (toolName) {
    case 'buy_position': {
      const assetType = String(args.assetType || 'crypto') as 'crypto' | 'stock' | 'etf' | 'cash' | 'manual';
      const name = String(args.name || resolvedSymbol);
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
        summary = `Buy ${amount} ${resolvedSymbol}${resolvedPrice ? ` at $${resolvedPrice.toFixed(2)}` : ''}`;
      } else if (resolvedTotalCost && resolvedTotalCost > 0) {
        summary = `Buy $${resolvedTotalCost.toLocaleString()} worth of ${resolvedSymbol}`;
      } else {
        summary = `Buy ${resolvedSymbol}`;
      }

      return {
        action: 'buy',
        symbol: resolvedSymbol,
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
      const sellMatchedPosition = symbol
        ? resolveSellPositionMatch(db.positions, symbol, matchedAccountId)
        : undefined;
      const sellSymbol = sellMatchedPosition?.symbol.toUpperCase() || resolvedSymbol;
      const sellMatchedAccountId = sellMatchedPosition?.accountId || matchedAccountId;
      const sellAmount = args.amount ? Number(args.amount) : undefined;
      const sellPercent = args.percent ? Number(args.percent) : undefined;
      const date = resolveDate(args.date);
      const inferredPrice = price || inferSellPrice(db, sellSymbol, sellMatchedPosition || matchedPosition);
      return {
        action: 'sell_partial',
        symbol: sellSymbol,
        assetType: sellMatchedPosition?.type || matchedPosition?.type || 'crypto',
        sellAmount,
        sellPercent,
        sellPrice: inferredPrice,
        date,
        matchedPositionId: sellMatchedPosition?.id,
        matchedAccountId: sellMatchedAccountId,
        confidence: 0.9,
        summary: `Sell ${sellAmount ? sellAmount + ' ' : sellPercent ? sellPercent + '% of ' : ''}${sellSymbol}`,
      };
    }
    case 'sell_all': {
      const sellMatchedPosition = symbol
        ? resolveSellPositionMatch(db.positions, symbol, matchedAccountId)
        : undefined;
      const sellSymbol = sellMatchedPosition?.symbol.toUpperCase() || resolvedSymbol;
      const sellMatchedAccountId = sellMatchedPosition?.accountId || matchedAccountId;
      const date = resolveDate(args.date);
      const inferredPrice = price || inferSellPrice(db, sellSymbol, sellMatchedPosition || matchedPosition);
      return {
        action: 'sell_all',
        symbol: sellSymbol,
        assetType: sellMatchedPosition?.type || matchedPosition?.type || 'crypto',
        sellPrice: inferredPrice,
        date,
        matchedPositionId: sellMatchedPosition?.id,
        matchedAccountId: sellMatchedAccountId,
        confidence: 0.9,
        summary: `Sell all ${sellSymbol}`,
      };
    }
    case 'remove_position': {
      return {
        action: 'remove',
        symbol: resolvedSymbol,
        assetType: matchedPosition?.type || 'crypto',
        matchedPositionId: matchedPosition?.id,
        confidence: 0.9,
        summary: `Remove ${resolvedSymbol} from portfolio`,
      };
    }
    case 'update_position': {
      const requestedCurrency = normalizeCashCurrencyCode(String(args.currency || ''));
      const symbolCurrency = normalizeCashCurrencyCode(resolvedSymbol);
      const explicitCashAssetType = typeof args.assetType === 'string' && args.assetType.toLowerCase() === 'cash';
      const shouldInferCashFromSymbol = !matchedPosition || matchedPosition.type === 'cash';
      const maybeCashCurrency =
        explicitCashAssetType
          ? (requestedCurrency || symbolCurrency)
          : (shouldInferCashFromSymbol ? symbolCurrency : '');
      const updatePositionMatch = maybeCashCurrency
        ? resolveCashUpdateMatch(db.positions, maybeCashCurrency, matchedAccountId)
        : undefined;
      const updateSymbolMatches = updatePositionMatch
        ? [updatePositionMatch]
        : db.positions.filter((p) => p.symbol.toUpperCase() === resolvedSymbol);
      const updateMatchedPositionId = updateSymbolMatches.length === 1
        ? updateSymbolMatches[0].id
        : undefined;
      const isCashUpdate = !!updatePositionMatch || (typeof args.assetType === 'string' && args.assetType.toLowerCase() === 'cash');
      return {
        action: 'update_position',
        symbol: updatePositionMatch ? updatePositionMatch.symbol.toUpperCase() : resolvedSymbol,
        assetType: isCashUpdate ? 'cash' : (matchedPosition?.type || 'crypto'),
        amount,
        costBasis: args.costBasis ? Number(args.costBasis) : undefined,
        date: args.date ? resolveDate(args.date) : undefined,
        matchedPositionId: updateMatchedPositionId,
        ...(isCashUpdate ? { currency: maybeCashCurrency || (updatePositionMatch ? extractCurrencyFromCashPosition(updatePositionMatch) : undefined) || undefined } : {}),
        confidence: 0.9,
        summary: `Update ${(updatePositionMatch ? updatePositionMatch.symbol.toUpperCase() : resolvedSymbol)} position`,
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
      const currency = normalizeCashCurrencyCode(String(args.currency || args.symbol || 'USD')) || 'USD';
      const cashAccountResolution = resolveAccountFromArgs(db.accounts, args, { manualOnly: true });
      const cashMatchedAccountId = cashAccountResolution.account?.id;
      const cashAccountName = cashAccountResolution.account?.name || cashAccountResolution.input;
      const matchedCash = resolveCashUpdateMatch(db.positions, currency, cashMatchedAccountId);
      return {
        action: 'add_cash',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: cashAccountName,
        matchedPositionId: matchedCash?.id,
        matchedAccountId: cashMatchedAccountId,
        confidence: 0.9,
        summary: `Add ${amount ?? '?'} ${currency}${cashAccountName ? ` to ${cashAccountName}` : ''}`,
      };
    }
    case 'update_cash': {
      const currency = normalizeCashCurrencyCode(String(args.currency || args.symbol || ''));
      const cashAccountResolution = resolveAccountFromArgs(db.accounts, args, { manualOnly: true });
      const cashMatchedAccountId = cashAccountResolution.account?.id;
      const cashAccountName = cashAccountResolution.account?.name || cashAccountResolution.input;
      const matchedCash = resolveCashUpdateMatch(db.positions, currency, cashMatchedAccountId);

      return {
        action: 'update_position',
        symbol: currency,
        assetType: 'cash',
        amount,
        currency,
        accountName: cashAccountName,
        matchedPositionId: matchedCash?.id,
        matchedAccountId: cashMatchedAccountId,
        confidence: 0.9,
        summary: `Update ${currency} balance to ${amount ?? '?'}${cashAccountName ? ` in ${cashAccountName}` : ''}`,
      };
    }
    default:
      return null;
  }
}
