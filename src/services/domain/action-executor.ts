/**
 * Action Executor
 *
 * Shared execution logic for portfolio commands. Used by both the
 * ConfirmPositionActionModal (full modal) and InlineConfirmation (compact).
 */

import { ParsedPositionAction, Position, AssetWithPrice, PriceData, Transaction } from '@/types';
import {
  executePartialSell,
  executeFullSell,
  executeBuy,
} from '@/services/domain/position-operations';

export interface ExecutionContext {
  // Store actions
  updatePosition: (id: string, updates: Partial<Position>) => void;
  removePosition: (id: string) => void;
  addPosition: (position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'> & { id?: string }) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  updatePrice: (symbol: string, price: PriceData) => void;
  setCustomPrice: (symbol: string, price: number, note: string) => void;

  // Data
  positions: Position[];
  positionsWithPrices: AssetWithPrice[];
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  summary?: string;
}

/**
 * Execute a parsed action against the store.
 * Returns a result indicating success or failure.
 */
export function executeAction(
  action: ParsedPositionAction,
  ctx: ExecutionContext,
): ExecutionResult {
  const { positions, updatePosition, removePosition, addPosition, addTransaction, updatePrice, setCustomPrice } = ctx;

  const matchedPosition = action.matchedPositionId
    ? positions.find(p => p.id === action.matchedPositionId) ?? null
    : null;

  const numAmount = action.amount ?? 0;
  const date = action.date || new Date().toISOString().split('T')[0];
  const currency = action.currency || 'USD';

  try {
    switch (action.action) {
      case 'sell_all': {
        if (!matchedPosition) return { success: false, error: 'No matching position found to sell' };
        const sellPrice = action.sellPrice ?? 0;
        const result = executeFullSell(matchedPosition, sellPrice, date);
        addTransaction(result.transaction);
        if (result.removedPositionId) removePosition(result.removedPositionId);
        return { success: true, summary: `Sold all ${matchedPosition.symbol}` };
      }

      case 'sell_partial': {
        if (!matchedPosition) return { success: false, error: 'No matching position found to sell' };
        const sellAmount = action.sellAmount ?? 0;
        const sellPrice = action.sellPrice ?? 0;
        const result = executePartialSell(matchedPosition, sellAmount, sellPrice, date);
        addTransaction(result.transaction);
        if (result.removedPositionId) {
          removePosition(result.removedPositionId);
        } else if (result.updatedPosition) {
          updatePosition(matchedPosition.id, result.updatedPosition);
        }
        return { success: true, summary: `Sold ${sellAmount} ${matchedPosition.symbol}` };
      }

      case 'buy': {
        const existingPos = matchedPosition;
        const result = executeBuy(existingPos, action, date);
        addTransaction(result.transaction);
        if (result.updatedPosition && existingPos) {
          updatePosition(existingPos.id, result.updatedPosition);
        } else if (result.newPosition) {
          addPosition(result.newPosition);
        }
        return { success: true, summary: `Bought ${numAmount} ${action.symbol}` };
      }

      case 'add_cash': {
        if (matchedPosition) {
          // Add to existing cash position
          const newAmount = matchedPosition.amount + numAmount;
          updatePosition(matchedPosition.id, { amount: newAmount, costBasis: newAmount });
          return { success: true, summary: `Added ${numAmount.toLocaleString()} ${currency} to ${matchedPosition.name}` };
        }
        // Create new cash position
        const cashSymbol = `CASH_${currency}_${Date.now()}`;
        const accountName = action.accountName || '';
        addPosition({
          type: 'cash',
          symbol: cashSymbol,
          name: accountName.trim() ? `${accountName.trim()} (${currency})` : `Cash (${currency})`,
          amount: numAmount,
          costBasis: numAmount,
        });
        updatePrice(cashSymbol.toLowerCase(), {
          symbol: currency,
          price: 1,
          change24h: 0,
          changePercent24h: 0,
          lastUpdated: new Date().toISOString(),
        });
        return { success: true, summary: `Added ${numAmount.toLocaleString()} ${currency}` };
      }

      case 'update_cash': {
        const target = matchedPosition
          ?? positions.filter(p => p.type === 'cash').find(p => p.id === action.matchedPositionId)
          ?? (positions.filter(p => p.type === 'cash').length === 1 ? positions.filter(p => p.type === 'cash')[0] : null);
        if (!target) return { success: false, error: 'No matching cash position found' };
        updatePosition(target.id, { amount: numAmount, costBasis: numAmount });
        return { success: true, summary: `Updated ${target.name} to ${numAmount.toLocaleString()}` };
      }

      case 'remove': {
        if (action.matchedPositionId) {
          removePosition(action.matchedPositionId);
        } else {
          const symbolMatches = positions.filter(p => p.symbol.toUpperCase() === action.symbol.toUpperCase());
          if (symbolMatches.length === 0) return { success: false, error: `No position found for ${action.symbol}` };
          for (const p of symbolMatches) removePosition(p.id);
        }
        return { success: true, summary: `Removed ${action.symbol}` };
      }

      case 'set_price': {
        const newPrice = action.newPrice ?? 0;
        if (newPrice <= 0) return { success: false, error: 'Price must be greater than 0' };
        setCustomPrice(action.symbol.toLowerCase(), newPrice, 'Set via command palette');
        return { success: true, summary: `Set ${action.symbol} price to $${newPrice.toLocaleString()}` };
      }

      case 'update_position': {
        if (!matchedPosition) return { success: false, error: 'No matching position found to update' };
        if (matchedPosition.walletAddress) return { success: false, error: 'Cannot edit wallet-synced positions' };
        const updates: Partial<Position> = {};
        if (action.amount != null) updates.amount = action.amount;
        if (action.costBasis != null) updates.costBasis = action.costBasis;
        if (action.date) updates.purchaseDate = action.date;
        if (Object.keys(updates).length === 0) return { success: false, error: 'No fields to update' };
        updatePosition(matchedPosition.id, updates);
        return { success: true, summary: `Updated ${matchedPosition.symbol} position` };
      }

      default:
        return { success: false, error: `Unknown action: ${action.action}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Operation failed' };
  }
}

/**
 * Check if an action qualifies for inline confirmation (no missing fields, simple action).
 */
export function canInlineConfirm(action: ParsedPositionAction): boolean {
  const missing = action.missingFields ?? [];
  if (missing.length > 0) return false;
  return action.action === 'update_cash' || action.action === 'set_price' || action.action === 'remove' || action.action === 'update_position';
}
