import { extractAccountInput } from '../command-account-resolver';
import { getToolById } from '../tool-registry';
import type { CommandFrame, CommandMode, CommandQuantity, CommandTarget } from './contracts';

function toDateOnlyString(input: unknown): string {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'today') return new Date().toISOString().split('T')[0];
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
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function normalizeCurrencyCode(input: string): string {
  const normalized = input.toUpperCase().trim();
  if (!normalized) return '';
  const fromCashSymbol = normalized.match(/CASH_([A-Z]{3})/);
  if (fromCashSymbol?.[1]) return fromCashSymbol[1];
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  return '';
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const normalized = trimmed
      .replace(/[, ]+/g, '')
      .replace(/^\$/, '');
    const num = Number(normalized);
    if (Number.isFinite(num) && num > 0) return num;
    const suffixMatch = normalized.match(/^(\d+(?:\.\d+)?)([kmb])$/i);
    if (suffixMatch) {
      const base = Number(suffixMatch[1]);
      if (!Number.isFinite(base)) return undefined;
      const suffix = suffixMatch[2].toLowerCase();
      const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : 1e9;
      const scaled = base * multiplier;
      return scaled > 0 ? scaled : undefined;
    }
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function inferMode(commandId: string, userText: string | undefined): CommandMode | undefined {
  if (commandId === 'add_cash') return 'delta';
  if (commandId === 'update_cash') return 'absolute';
  if (commandId === 'update_position') {
    const text = (userText || '').toLowerCase();
    if (/\b(add|deposit|top\s*up|increase)\b/.test(text)) return 'delta';
    if (/\b(set|balance)\b/.test(text) || /=/.test(text)) return 'absolute';
    return 'absolute';
  }
  return undefined;
}

function inferQuantity(commandId: string, args: Record<string, unknown>): CommandQuantity | undefined {
  const amount = toPositiveNumber(args.amount);
  const totalCost = toPositiveNumber(args.totalCost);
  const percent = toPositiveNumber(args.percent);

  if (commandId === 'buy_position') {
    if (totalCost) return { notional: totalCost };
    if (amount) return { units: amount };
  }

  if (commandId === 'sell_partial') {
    if (percent) return { percent };
    if (amount) return { units: amount };
  }

  if (commandId === 'sell_all') {
    return undefined;
  }

  if (commandId === 'update_position' || commandId === 'update_cash' || commandId === 'add_cash') {
    if (amount) return { units: amount };
  }

  return undefined;
}

function buildTarget(commandId: string, args: Record<string, unknown>): CommandTarget {
  const symbol = typeof args.symbol === 'string' ? args.symbol.toUpperCase() : undefined;
  const currencyArg = typeof args.currency === 'string' ? args.currency : '';
  const currency = normalizeCurrencyCode(currencyArg || symbol || '');
  const accountName = extractAccountInput(args);
  const assetTypeHint = typeof args.assetType === 'string' ? args.assetType : undefined;

  const target: CommandTarget = {
    symbol,
    currency: currency || undefined,
    accountName,
    assetTypeHint,
  };

  if (commandId === 'add_cash' || commandId === 'update_cash') {
    target.symbol = currency || target.symbol;
  }

  return target;
}

export function buildCommandFrameFromToolCall(
  commandId: string,
  args: Record<string, unknown>,
  userText?: string,
): CommandFrame {
  const tool = getToolById(commandId);
  const kind = tool?.type || 'mutation';
  const date = args.date ? toDateOnlyString(args.date) : undefined;

  return {
    commandId,
    kind,
    mode: inferMode(commandId, userText),
    target: buildTarget(commandId, args),
    quantity: inferQuantity(commandId, args),
    date,
    args,
    metadata: {
      source: 'tool_call',
    },
  };
}
