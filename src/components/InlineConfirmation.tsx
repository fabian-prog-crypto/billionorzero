'use client';

import { ParsedPositionAction, Position, AssetWithPrice } from '@/types';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface InlineConfirmationProps {
  action: ParsedPositionAction;
  positions: Position[];
  positionsWithPrices: AssetWithPrice[];
  hideBalances: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function InlineConfirmation({
  action,
  positions,
  positionsWithPrices,
  hideBalances,
  onConfirm,
  onCancel,
}: InlineConfirmationProps) {
  const mask = (v: string) => hideBalances ? '••••' : v;

  const matchedPosition = action.matchedPositionId
    ? positions.find(p => p.id === action.matchedPositionId) ?? null
    : null;

  // Action-specific rendering
  if (action.action === 'update_cash' && matchedPosition && action.amount != null) {
    const currMatch = matchedPosition.symbol.match(/CASH_([A-Z]{3})/);
    const currency = action.currency || (currMatch ? currMatch[1] : 'USD');
    const diff = action.amount - matchedPosition.amount;
    const diffColor = diff >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
    const diffSign = diff >= 0 ? '+' : '';

    return (
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
          UPDATE CASH
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--foreground-muted)]">{matchedPosition.name}</span>
          <div className="font-mono text-sm">
            <span>{mask(formatNumber(matchedPosition.amount))}</span>
            <span className="text-[var(--foreground-muted)] mx-2">&rarr;</span>
            <span>{mask(formatNumber(action.amount))}</span>
          </div>
        </div>
        <div className="flex justify-end">
          <span className={`text-xs font-mono ${diffColor}`}>
            {mask(`${diffSign}${formatNumber(diff)} ${currency}`)}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-[13px]">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-primary flex-1 text-[13px]">
            Update to {mask(formatNumber(action.amount))} {currency}
          </button>
        </div>
      </div>
    );
  }

  if (action.action === 'set_price' && action.newPrice != null) {
    const affected = positionsWithPrices.filter(
      p => p.symbol.toUpperCase() === action.symbol.toUpperCase()
    );
    const firstAffected = affected[0];
    const oldPrice = firstAffected?.currentPrice ?? 0;

    return (
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
          SET PRICE
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{action.symbol}</span>
          <div className="font-mono text-sm">
            <span>{mask(formatCurrency(oldPrice))}</span>
            <span className="text-[var(--foreground-muted)] mx-2">&rarr;</span>
            <span>{mask(formatCurrency(action.newPrice))}</span>
          </div>
        </div>
        {affected.length > 0 && (
          <div className="flex justify-end">
            <span className="text-xs text-[var(--foreground-muted)]">
              {affected.length} position{affected.length > 1 ? 's' : ''} affected
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-[13px]">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-primary flex-1 text-[13px]">
            Set Price to {mask(formatCurrency(action.newPrice))}
          </button>
        </div>
      </div>
    );
  }

  if (action.action === 'remove') {
    const symbolMatches = positions.filter(
      p => p.symbol.toUpperCase() === action.symbol.toUpperCase()
    );
    const matchedForRemove = action.matchedPositionId
      ? positions.filter(p => p.id === action.matchedPositionId)
      : symbolMatches;
    const priceInfo = matchedForRemove.map(p => positionsWithPrices.find(pw => pw.id === p.id));

    return (
      <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-[var(--negative)]">
          REMOVE
        </p>
        {matchedForRemove.map((p, i) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span className="font-medium">{p.symbol.toUpperCase()}</span>
            <div className="font-mono text-sm">
              <span className="text-[var(--foreground-muted)]">{mask(formatNumber(p.amount))} units</span>
              {priceInfo[i] && (
                <span className="ml-2">{mask(formatCurrency(priceInfo[i]!.value))}</span>
              )}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-[13px]">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-danger flex-1 text-[13px]">
            Remove {action.symbol}
          </button>
        </div>
      </div>
    );
  }

  // Fallback (shouldn't reach here for inline-eligible actions)
  return null;
}
