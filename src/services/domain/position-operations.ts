/**
 * Position Operations
 *
 * Business logic for executing position changes (buy, sell, update).
 * Creates Transaction records for every operation.
 */

import { v4 as uuidv4 } from 'uuid';
import { Position, Transaction, ParsedPositionAction, AssetType } from '@/types';
import { getCategoryService } from './category-service';

interface PositionOperationResult {
  success: boolean;
  transaction: Omit<Transaction, 'id' | 'createdAt'>;
  updatedPosition?: Partial<Position>;
  removedPositionId?: string;
  newPosition?: Omit<Position, 'addedAt' | 'updatedAt'>;
}

/**
 * Execute a partial sell — reduce position amount and proportionally reduce cost basis
 */
export function executePartialSell(
  position: Position,
  sellAmount: number,
  sellPrice: number,
  date: string,
  notes?: string
): PositionOperationResult {
  const originalAmount = position.amount;
  const remainingAmount = originalAmount - sellAmount;

  if (remainingAmount < 0) {
    throw new Error(`Cannot sell ${sellAmount} — only ${originalAmount} available`);
  }

  // Proportional cost basis
  const costBasisAtExecution = position.costBasis !== undefined
    ? position.costBasis * (sellAmount / originalAmount)
    : undefined;

  const totalValue = sellAmount * sellPrice;

  const realizedPnL =
    costBasisAtExecution !== undefined
      ? totalValue - costBasisAtExecution
      : undefined;

  // New cost basis for remaining position
  const newCostBasis = position.costBasis !== undefined
    ? position.costBasis * (remainingAmount / originalAmount)
    : undefined;

  const transaction: Omit<Transaction, 'id' | 'createdAt'> = {
    type: 'sell',
    symbol: position.symbol,
    name: position.name,
    assetType: position.type,
    amount: sellAmount,
    pricePerUnit: sellPrice,
    totalValue,
    costBasisAtExecution,
    realizedPnL,
    positionId: position.id,
    date,
    notes,
  };

  // If remaining amount is essentially zero, remove the position
  if (remainingAmount < 0.000001) {
    return {
      success: true,
      transaction,
      removedPositionId: position.id,
    };
  }

  return {
    success: true,
    transaction,
    updatedPosition: {
      amount: remainingAmount,
      costBasis: newCostBasis,
    },
  };
}

/**
 * Execute a full sell — remove position entirely
 */
export function executeFullSell(
  position: Position,
  sellPrice: number,
  date: string,
  notes?: string
): PositionOperationResult {
  const totalValue = position.amount * sellPrice;

  const costBasisAtExecution = position.costBasis;
  const realizedPnL =
    costBasisAtExecution !== undefined
      ? totalValue - costBasisAtExecution
      : undefined;

  const transaction: Omit<Transaction, 'id' | 'createdAt'> = {
    type: 'sell',
    symbol: position.symbol,
    name: position.name,
    assetType: position.type,
    amount: position.amount,
    pricePerUnit: sellPrice,
    totalValue,
    costBasisAtExecution,
    realizedPnL,
    positionId: position.id,
    date,
    notes,
  };

  return {
    success: true,
    transaction,
    removedPositionId: position.id,
  };
}

/**
 * Execute a buy — add to existing position or create new
 */
export function executeBuy(
  existingPosition: Position | null,
  action: ParsedPositionAction,
  date: string,
  notes?: string
): PositionOperationResult {
  const amount = action.amount || 0;
  if (!amount || amount <= 0) {
    throw new Error('Buy amount must be greater than zero');
  }
  const pricePerUnit = action.pricePerUnit || 0;
  const totalValue = action.totalCost ?? (amount * pricePerUnit);

  if (existingPosition) {
    // Add to existing — weighted average cost basis
    const newAmount = existingPosition.amount + amount;
    const existingCost = existingPosition.costBasis || 0;
    const newCostBasis = existingCost + totalValue;

    const transaction: Omit<Transaction, 'id' | 'createdAt'> = {
      type: 'buy',
      symbol: existingPosition.symbol,
      name: existingPosition.name,
      assetType: existingPosition.type,
      amount,
      pricePerUnit,
      totalValue,
      positionId: existingPosition.id,
      date,
      notes,
    };

    return {
      success: true,
      transaction,
      updatedPosition: {
        amount: newAmount,
        costBasis: newCostBasis,
        purchaseDate: existingPosition.purchaseDate || date,
      },
    };
  }

  // New position
  const positionId = uuidv4();
  const transaction: Omit<Transaction, 'id' | 'createdAt'> = {
    type: 'buy',
    symbol: action.symbol,
    name: action.name || action.symbol,
    assetType: action.assetType,
    amount,
    pricePerUnit,
    totalValue,
    positionId,
    date,
    notes,
  };

  const newPosition: Omit<Position, 'addedAt' | 'updatedAt'> = {
    id: positionId,
    assetClass: getCategoryService().getAssetClass(action.symbol, action.assetType),
    type: action.assetType,
    symbol: action.symbol,
    name: action.name || action.symbol,
    amount,
    costBasis: totalValue,
    purchaseDate: date,
  };

  return {
    success: true,
    transaction: { ...transaction, positionId },
    newPosition,
  };
}

export type { PositionOperationResult };
