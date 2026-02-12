'use client';

import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, TrendingUp, TrendingDown, DollarSign, Trash2, RefreshCw, Tag, Edit2 } from 'lucide-react';
import { ParsedPositionAction, Position, Account, AssetWithPrice, WalletConnection } from '@/types';
import { usePortfolioStore } from '@/store/portfolioStore';
import {
  executePartialSell,
  executeFullSell,
  executeBuy,
} from '@/services/domain/position-operations';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

interface ConfirmPositionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedAction: ParsedPositionAction;
  positions: Position[];
  positionsWithPrices: AssetWithPrice[];
}

const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'NZD', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'KRW', 'INR', 'BRL', 'MXN', 'ZAR', 'AED', 'THB', 'PLN', 'CZK', 'ILS', 'PHP', 'IDR', 'MYR', 'TRY', 'RUB', 'HUF', 'RON', 'BGN', 'HRK', 'ISK', 'TWD', 'VND'];

/**
 * Get relevant accounts for a given asset type.
 * Single source of truth for asset type → account type mapping.
 * Used for both the account dropdown and auto-selection.
 */
function getRelevantAccounts(
  assetType: string | undefined,
  store: { walletAccounts: () => Account[]; cexAccounts: () => Account[]; brokerageAccounts: () => Account[]; cashAccounts: () => Account[]; manualAccounts: () => Account[] },
): Account[] {
  if (assetType === 'stock' || assetType === 'etf') return store.brokerageAccounts();
  if (assetType === 'crypto') return [...store.walletAccounts(), ...store.cexAccounts()];
  if (assetType === 'cash') return store.cashAccounts();
  return store.manualAccounts();
}

export default function ConfirmPositionActionModal({
  isOpen,
  onClose,
  parsedAction,
  positions,
  positionsWithPrices,
}: ConfirmPositionActionModalProps) {
  const store = usePortfolioStore();
  const { updatePosition, removePosition, addPosition, addTransaction, updatePrice, setCustomPrice } = store;
  const brokerageAccounts = store.brokerageAccounts();

  // Editable fields
  const [action, setAction] = useState(parsedAction.action);
  const [symbol, setSymbol] = useState(parsedAction.symbol);
  const [amount, setAmount] = useState(parsedAction.amount?.toString() || '');
  const [sellAmount, setSellAmount] = useState(
    parsedAction.sellAmount?.toString() || ''
  );
  const [sellPercent, setSellPercent] = useState(
    parsedAction.sellPercent?.toString() || ''
  );
  const [sellPrice, setSellPrice] = useState(
    parsedAction.sellPrice?.toString() || ''
  );
  const [pricePerUnit, setPricePerUnit] = useState(
    parsedAction.pricePerUnit?.toString() || ''
  );
  const [date, setDate] = useState(
    parsedAction.date || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [matchedPositionId, setMatchedPositionId] = useState(
    parsedAction.matchedPositionId || ''
  );
  const [addToExisting, setAddToExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New action fields
  const [cashCurrency, setCashCurrency] = useState(parsedAction.currency || 'USD');
  const [accountName, setAccountName] = useState(parsedAction.accountName || '');
  const [newPrice, setNewPrice] = useState(parsedAction.newPrice?.toString() || '');
  const [editCostBasis, setEditCostBasis] = useState(parsedAction.costBasis?.toString() || '');
  const [editPurchaseDate, setEditPurchaseDate] = useState(parsedAction.date || '');

  // Account selector for buy/update_position
  const [selectedAccountId, setSelectedAccountId] = useState(
    parsedAction.matchedAccountId || ''
  );

  const firstMissingRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens with new action
  useEffect(() => {
    if (isOpen) {
      setAction(parsedAction.action);
      setSymbol(parsedAction.symbol);
      setAmount(parsedAction.amount?.toString() || '');
      setSellAmount(parsedAction.sellAmount?.toString() || '');
      setSellPercent(parsedAction.sellPercent?.toString() || '');
      setDate(parsedAction.date || new Date().toISOString().split('T')[0]);
      setNotes('');
      setMatchedPositionId(parsedAction.matchedPositionId || '');
      setAddToExisting(true);
      setError(null);
      setIsSubmitting(false);
      setCashCurrency(parsedAction.currency || 'USD');
      setAccountName(parsedAction.accountName || '');
      setNewPrice(parsedAction.newPrice?.toString() || '');
      setEditCostBasis(parsedAction.costBasis?.toString() || '');
      setEditPurchaseDate(parsedAction.date || '');

      // Auto-fill price from current market price when missing
      const matched = parsedAction.matchedPositionId
        ? positionsWithPrices.find((p) => p.id === parsedAction.matchedPositionId)
        : null;
      const marketPrice = matched && matched.currentPrice > 0 ? matched.currentPrice : 0;

      const isSellAction = parsedAction.action === 'sell_partial' || parsedAction.action === 'sell_all';
      if (isSellAction) {
        setSellPrice(
          parsedAction.sellPrice
            ? parsedAction.sellPrice.toString()
            : marketPrice ? marketPrice.toString() : ''
        );
      } else {
        setSellPrice(parsedAction.sellPrice?.toString() || '');
      }

      if (parsedAction.action === 'buy') {
        setPricePerUnit(
          parsedAction.pricePerUnit
            ? parsedAction.pricePerUnit.toString()
            : marketPrice ? marketPrice.toString() : ''
        );
      } else {
        setPricePerUnit(parsedAction.pricePerUnit?.toString() || '');
      }

      // Pre-fill update_position fields from the matched position
      if (parsedAction.action === 'update_position' && parsedAction.matchedPositionId) {
        const pos = positions.find(p => p.id === parsedAction.matchedPositionId);
        if (pos) {
          setAmount(parsedAction.amount?.toString() || pos.amount.toString());
          setEditCostBasis(parsedAction.costBasis?.toString() || pos.costBasis?.toString() || '');
          setEditPurchaseDate(parsedAction.date || pos.purchaseDate || '');
        }
      }

      // If totalCost provided but no amount, derive amount from market price
      if (parsedAction.action === 'buy' && !parsedAction.amount && parsedAction.totalCost && parsedAction.totalCost > 0) {
        const sym = parsedAction.symbol.toLowerCase();
        const storePrice = store.prices[sym]?.price;
        const posPrice = positionsWithPrices.find(
          p => p.symbol.toLowerCase() === sym
        )?.currentPrice;
        const marketPrice = posPrice || storePrice;
        if (marketPrice && marketPrice > 0) {
          const derivedAmount = parsedAction.totalCost / marketPrice;
          setAmount(derivedAmount.toFixed(6));
          setPricePerUnit(marketPrice.toString());
        }
      }

      // Auto-select account: matchedAccountId → matched position's account → first relevant account
      const matchedPos = parsedAction.matchedPositionId
        ? positions.find(p => p.id === parsedAction.matchedPositionId)
        : null;
      const firstRelevant = getRelevantAccounts(parsedAction.assetType, store)[0];
      const resolvedAccountId =
        parsedAction.matchedAccountId ||
        matchedPos?.accountId ||
        firstRelevant?.id ||
        '';
      setSelectedAccountId(resolvedAccountId);
    }
  }, [isOpen, parsedAction, positionsWithPrices, positions, store]);

  // Auto-focus first missing field
  useEffect(() => {
    if (isOpen && firstMissingRef.current) {
      setTimeout(() => firstMissingRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSell = action === 'sell_partial' || action === 'sell_all';
  const isBuy = action === 'buy';
  const isAddCash = action === 'add_cash';
  const isRemove = action === 'remove';
  const isUpdateCash = action === 'update_cash';
  const isSetPrice = action === 'set_price';
  const isUpdatePosition = action === 'update_position';

  // Compute relevant accounts for the account dropdown
  const relevantAccounts = getRelevantAccounts(parsedAction.assetType, store);

  // Find matched position
  const matchedPosition = matchedPositionId
    ? positions.find((p) => p.id === matchedPositionId)
    : null;

  const matchedWithPrice = matchedPositionId
    ? positionsWithPrices.find((p) => p.id === matchedPositionId)
    : null;

  // Find all positions with this symbol (for ambiguous matching)
  const symbolMatches = positions.filter(
    (p) => p.symbol.toUpperCase() === symbol.toUpperCase()
  );

  // Calculate preview values
  const numSellAmount = parseFloat(sellAmount) || 0;
  const numSellPrice = parseFloat(sellPrice) || 0;
  const numAmount = parseFloat(amount) || 0;
  const numPricePerUnit = parseFloat(pricePerUnit) || 0;
  const numNewPrice = parseFloat(newPrice) || 0;

  const sellTotal = numSellAmount * numSellPrice;
  const effectiveSellTotal = action === 'sell_all' && matchedPosition
    ? matchedPosition.amount * numSellPrice
    : sellTotal;
  const buyTotal = (numAmount * numPricePerUnit) || parsedAction.totalCost || 0;

  // Cost basis calculation for sells
  let costBasisAtExecution: number | undefined;
  let realizedPnL: number | undefined;
  if (isSell && matchedPosition?.costBasis !== undefined && (numSellAmount > 0 || action === 'sell_all')) {
    if (action === 'sell_all') {
      costBasisAtExecution = matchedPosition.costBasis;
    } else {
      costBasisAtExecution = matchedPosition.amount > 0
        ? matchedPosition.costBasis * (numSellAmount / matchedPosition.amount)
        : 0;
    }
    if (numSellPrice > 0) {
      realizedPnL = effectiveSellTotal - costBasisAtExecution;
    }
  }

  // Before/after preview for sells
  const afterAmount = matchedPosition
    ? action === 'sell_all'
      ? 0
      : matchedPosition.amount - numSellAmount
    : 0;
  const afterCostBasis =
    matchedPosition?.costBasis !== undefined && action !== 'sell_all'
      ? matchedPosition.amount > 0
        ? matchedPosition.costBasis * (afterAmount / matchedPosition.amount)
        : 0
      : 0;

  const effectiveSellAmount = action === 'sell_all' && matchedPosition
    ? matchedPosition.amount
    : numSellAmount;
  const sellPercentOfPosition = matchedPosition && matchedPosition.amount > 0
    ? (effectiveSellAmount / matchedPosition.amount) * 100
    : 0;

  // Check for missing required fields
  const missingFields: string[] = [];
  if (isSell && numSellPrice <= 0) missingFields.push('sellPrice');
  if (isSell && action === 'sell_partial' && !numSellAmount)
    missingFields.push('sellAmount');
  if (isSell && action === 'sell_partial' && matchedPosition && numSellAmount > matchedPosition.amount)
    missingFields.push('sellAmount exceeds position');
  if (isBuy && !numAmount && !(parsedAction.totalCost && parsedAction.totalCost > 0)) missingFields.push('amount');
  if (isBuy && numPricePerUnit <= 0 && !(parsedAction.totalCost && parsedAction.totalCost > 0)) missingFields.push('pricePerUnit');
  if (isAddCash && numAmount <= 0) missingFields.push('amount');
  if (isAddCash && !cashCurrency) missingFields.push('currency');
  if (isAddCash && !matchedPositionId && !accountName.trim()) missingFields.push('accountName');
  if (isUpdateCash && numAmount <= 0) missingFields.push('amount');
  if (isSetPrice && numNewPrice <= 0) missingFields.push('newPrice');
  if (isUpdatePosition) {
    const numEditCB = parseFloat(editCostBasis);
    const hasAmountChange = amount && numAmount > 0;
    const hasCostBasisChange = editCostBasis && !isNaN(numEditCB);
    const hasDateChange = !!editPurchaseDate;
    if (!hasAmountChange && !hasCostBasisChange && !hasDateChange) {
      missingFields.push('at least one field');
    }
  }

  const canConfirm = missingFields.length === 0;

  // Recalculate sell amount when percent changes
  const handleSellPercentChange = (percentStr: string) => {
    setSellPercent(percentStr);
    const pct = parseFloat(percentStr);
    if (matchedPosition && pct > 0 && pct <= 100) {
      setSellAmount(
        (matchedPosition.amount * (pct / 100)).toString()
      );
    }
  };

  // Determine brokerage account ID from the matched position's accountId
  const brokerageAccountId = matchedPosition?.accountId
    ? (brokerageAccounts.some(a => a.id === matchedPosition.accountId) ? matchedPosition.accountId : null)
    : null;

  // For buys of equities, we can infer brokerage context even without a matched position
  const buyBrokerageContext = isBuy && !brokerageAccountId
    && (parsedAction.assetType === 'stock' || parsedAction.assetType === 'etf')
    && brokerageAccounts.length > 0;

  const hasBrokerageContext = !!brokerageAccountId || buyBrokerageContext;

  // Replicate the execution-time brokerage ID logic for accurate preview.
  const previewBrokerageId: string | null = isSell
    ? brokerageAccountId
    : isBuy
      ? (addToExisting && matchedPosition?.accountId && brokerageAccounts.some(a => a.id === matchedPosition.accountId)
        ? matchedPosition.accountId
        : (parsedAction.assetType === 'stock' || parsedAction.assetType === 'etf') && brokerageAccounts.length > 0
          ? brokerageAccounts[0].id
          : null)
      : null;

  const previewCashPosition = previewBrokerageId
    ? positions.find(p => p.type === 'cash' && p.accountId === previewBrokerageId)
    : null;
  const currentCashBalance = previewCashPosition?.amount ?? null;

  // Brokerage account name for display
  const previewBrokerageAccount = previewBrokerageId
    ? brokerageAccounts.find(a => a.id === previewBrokerageId) ?? null
    : null;

  // Projected cash balance (for negative warning)
  const projectedCashBalance = currentCashBalance !== null
    ? isSell
      ? currentCashBalance + effectiveSellTotal
      : currentCashBalance - buyTotal
    : null;

  // Buy: new cost basis and avg cost per unit
  const newCostBasisAfterBuy = matchedPosition?.costBasis !== undefined && addToExisting
    ? matchedPosition.costBasis + buyTotal
    : buyTotal;
  const newAvgCostAfterBuy = matchedPosition && addToExisting
    ? newCostBasisAfterBuy / (matchedPosition.amount + numAmount)
    : numPricePerUnit;
  const currentAvgCost = matchedPosition && matchedPosition.amount > 0 && matchedPosition.costBasis !== undefined
    ? matchedPosition.costBasis / matchedPosition.amount
    : null;

  // Sell: P&L as percentage of cost basis
  const realizedPnLPercent = realizedPnL !== undefined && costBasisAtExecution && costBasisAtExecution > 0
    ? (realizedPnL / costBasisAtExecution) * 100
    : null;

  // For add_cash: find all existing cash positions for account dropdown
  const allCashPositions = isAddCash
    ? positions.filter(p => p.type === 'cash')
    : [];

  // For update_cash: find matching cash positions
  const updateCashCandidates = isUpdateCash
    ? positions.filter(p => p.type === 'cash')
    : [];
  const updateCashMatched = isUpdateCash && matchedPositionId
    ? positions.find(p => p.id === matchedPositionId)
    : updateCashCandidates.length === 1 ? updateCashCandidates[0] : null;

  // For set_price: find all positions affected by this symbol
  const setPriceAffectedPositions = isSetPrice
    ? positionsWithPrices.filter(p => p.symbol.toUpperCase() === symbol.toUpperCase())
    : [];

  // Cash side-effect: update or create cash position in the same brokerage account.
  // Returns true if a warning was shown (caller should NOT close the modal).
  const handleCashSideEffect = (cashDelta: number, brokerageId: string | null): boolean => {
    if (!brokerageId) return false;

    const existingCash = positions.find(
      (p) => p.type === 'cash' && p.accountId === brokerageId
    );

    if (existingCash) {
      const newAmount = existingCash.amount + cashDelta;
      if (newAmount < 0) {
        updatePosition(existingCash.id, { amount: newAmount, costBasis: 0 });
        setError(`Warning: Cash balance is now negative (${formatCurrency(newAmount)})`);
        return false;
      }
      updatePosition(existingCash.id, {
        amount: newAmount,
        costBasis: newAmount,
      });
    } else if (cashDelta > 0) {
      // Sell proceeds — create new cash position
      const cashSymbol = `CASH_USD_${Date.now()}`;
      addPosition({
        assetClass: 'cash',
        type: 'cash',
        symbol: cashSymbol,
        name: 'Cash (USD)',
        amount: cashDelta,
        costBasis: cashDelta,
        accountId: brokerageId,
      });
      updatePrice(cashSymbol.toLowerCase(), {
        symbol: 'USD',
        price: 1,
        change24h: 0,
        changePercent24h: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
    // If not found + buy (negative delta): skip — nothing to deduct from
    return false;
  };

  const handleConfirm = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (isSell && !matchedPosition) {
        setError('No matching position found to sell');
        return;
      }

      if (action === 'sell_all' && matchedPosition) {
        const result = executeFullSell(
          matchedPosition,
          numSellPrice,
          date,
          notes || undefined
        );
        addTransaction(result.transaction);
        if (result.removedPositionId) {
          removePosition(result.removedPositionId);
        }
        // Cash side-effect: add proceeds
        if (hasBrokerageContext) {
          const warned = handleCashSideEffect(result.transaction.totalValue, brokerageAccountId);
          if (warned) return;
        }
      } else if (action === 'sell_partial' && matchedPosition) {
        const result = executePartialSell(
          matchedPosition,
          numSellAmount,
          numSellPrice,
          date,
          notes || undefined
        );
        addTransaction(result.transaction);
        if (result.removedPositionId) {
          removePosition(result.removedPositionId);
        } else if (result.updatedPosition) {
          updatePosition(matchedPosition.id, result.updatedPosition);
        }
        // Cash side-effect: add proceeds
        if (hasBrokerageContext) {
          const warned = handleCashSideEffect(result.transaction.totalValue, brokerageAccountId);
          if (warned) return;
        }
      } else if (action === 'buy') {
        const existingPos =
          addToExisting && matchedPosition ? matchedPosition : null;

        // Determine accountId for new buys: prefer selectedAccountId from dropdown
        const cryptoAccounts = parsedAction.assetType === 'crypto'
          ? [...store.walletAccounts(), ...store.cexAccounts()]
          : [];
        const buyBrokerageAccountId = selectedAccountId
          ? selectedAccountId
          : existingPos?.accountId
          ? existingPos.accountId
          : (parsedAction.assetType === 'stock' || parsedAction.assetType === 'etf') && brokerageAccounts.length > 0
          ? brokerageAccounts[0].id
          : cryptoAccounts.length > 0
          ? cryptoAccounts[0].id
          : undefined;

        const actionData: ParsedPositionAction = {
          ...parsedAction,
          symbol,
          amount: numAmount,
          pricePerUnit: numPricePerUnit,
          totalCost: buyTotal,
        };

        const result = executeBuy(existingPos, actionData, date, notes || undefined);
        addTransaction(result.transaction);

        if (result.updatedPosition && existingPos) {
          updatePosition(existingPos.id, result.updatedPosition);
        } else if (result.newPosition) {
          addPosition({
            ...result.newPosition,
            ...(buyBrokerageAccountId ? { accountId: buyBrokerageAccountId } : {}),
          });
        }

        // Cash side-effect: deduct cost
        const effectiveBrokerageId = existingPos?.accountId && brokerageAccounts.some(a => a.id === existingPos.accountId)
          ? existingPos.accountId
          : buyBrokerageAccountId;

        const warned = handleCashSideEffect(-result.transaction.totalValue, effectiveBrokerageId ?? null);
        if (warned) return;
      } else if (isAddCash) {
        // Add cash: add to existing position or create new
        const existingMatch = matchedPositionId
          ? positions.find(p => p.id === matchedPositionId)
          : null;

        // Resolve accountId: selected dropdown → matched position's accountId
        const resolvedCashAccountId = selectedAccountId || existingMatch?.accountId || undefined;

        if (existingMatch) {
          // Add to existing cash position
          const newAmount = existingMatch.amount + numAmount;
          updatePosition(existingMatch.id, {
            amount: newAmount,
            costBasis: newAmount,
          });
        } else {
          // Create new cash position
          const cashSymbol = `CASH_${cashCurrency}_${Date.now()}`;
          addPosition({
            assetClass: 'cash',
            type: 'cash',
            symbol: cashSymbol,
            name: accountName.trim() ? `${accountName.trim()} (${cashCurrency})` : `Cash (${cashCurrency})`,
            amount: numAmount,
            costBasis: numAmount,
            ...(resolvedCashAccountId ? { accountId: resolvedCashAccountId } : {}),
          });
          // Set price to 1 for fiat (value = amount)
          updatePrice(cashSymbol.toLowerCase(), {
            symbol: cashCurrency,
            price: 1,
            change24h: 0,
            changePercent24h: 0,
            lastUpdated: new Date().toISOString(),
          });
        }
      } else if (isRemove) {
        // Remove position(s)
        if (matchedPositionId) {
          removePosition(matchedPositionId);
        } else if (symbolMatches.length > 0) {
          // Remove all matching positions
          for (const p of symbolMatches) {
            removePosition(p.id);
          }
        } else {
          setError(`No position found for ${symbol}`);
          return;
        }
      } else if (isUpdateCash) {
        // Update cash balance
        const target = updateCashMatched;
        if (!target) {
          setError('No matching cash position found');
          return;
        }
        const cashUpdates: Partial<Position> = {
          amount: numAmount,
          costBasis: numAmount,
        };
        // Move to a different bank account if changed
        if (selectedAccountId && selectedAccountId !== target.accountId) {
          cashUpdates.accountId = selectedAccountId;
        }
        updatePosition(target.id, cashUpdates);
      } else if (isSetPrice) {
        // Set custom price override
        if (numNewPrice <= 0) {
          setError('Price must be greater than 0');
          return;
        }
        setCustomPrice(symbol.toLowerCase(), numNewPrice, 'Set via command palette');
      } else if (isUpdatePosition) {
        // Update manual position fields
        if (!matchedPosition) {
          setError('No matching position found to update');
          return;
        }
        if (matchedPosition.accountId) {
          // Check if this is a wallet-synced position (can't edit those)
          const account = store.accounts.find(a => a.id === matchedPosition.accountId);
          if (account && (account.connection.dataSource === 'debank' || account.connection.dataSource === 'helius')) {
            setError('Cannot edit wallet-synced positions');
            return;
          }
        }
        const updates: Partial<typeof matchedPosition> = {};
        if (amount && numAmount > 0) updates.amount = numAmount;
        const numEditCostBasis = parseFloat(editCostBasis);
        if (editCostBasis && !isNaN(numEditCostBasis)) updates.costBasis = numEditCostBasis;
        if (editPurchaseDate) updates.purchaseDate = editPurchaseDate;
        // Allow moving position to a different account
        if (selectedAccountId && selectedAccountId !== matchedPosition.accountId) {
          updates.accountId = selectedAccountId;
        }
        if (Object.keys(updates).length === 0) {
          setError('No fields changed');
          return;
        }
        updatePosition(matchedPosition.id, updates);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action label and confirm button
  const actionLabel = isSell ? 'Sell' : isBuy ? 'Buy' : isAddCash ? 'Add Cash' : isRemove ? 'Remove' : isUpdateCash ? 'Update Cash' : isSetPrice ? 'Set Price' : isUpdatePosition ? 'Edit Position' : 'Update';

  const fmtAmount = numAmount > 0
    ? numAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '';

  const confirmLabel = isSell
    ? matchedPosition
      ? `Sell ${formatNumber(effectiveSellAmount)} ${symbol} (${Math.round(sellPercentOfPosition)}%)`
      : `Sell ${symbol}`
    : isBuy
    ? `Buy ${numAmount > 0 ? formatNumber(numAmount) + ' ' : ''}${symbol}`
    : isAddCash
    ? `Add ${fmtAmount} ${cashCurrency}`
    : isRemove
    ? `Remove ${symbol}`
    : isUpdateCash
    ? `Update to ${fmtAmount} ${cashCurrency}`
    : isSetPrice
    ? `Set Price to ${numNewPrice > 0 ? formatCurrency(numNewPrice) : '?'}`
    : isUpdatePosition
    ? `Update ${symbol}`
    : actionLabel;

  // Header accent color
  const headerBorderColor = isRemove
    ? 'border-[var(--negative)]'
    : isSell
    ? 'border-[var(--negative)]'
    : 'border-[var(--accent-primary)]';

  const headerTextColor = isRemove
    ? 'text-[var(--negative)]'
    : isSell
    ? 'text-[var(--negative)]'
    : 'text-[var(--accent-primary)]';

  // Summary banner background
  const bannerBg = isRemove
    ? 'bg-[var(--negative-light)]'
    : isSell
    ? 'bg-[var(--negative-light)]'
    : 'bg-[var(--positive-light)]';

  // Action icon
  const ActionIcon = isAddCash ? DollarSign
    : isRemove ? Trash2
    : isUpdateCash ? RefreshCw
    : isSetPrice ? Tag
    : isUpdatePosition ? Edit2
    : isSell ? TrendingDown
    : TrendingUp;

  const actionIconColor = isRemove
    ? 'text-[var(--negative)]'
    : isSell
    ? 'text-[var(--negative)]'
    : 'text-[var(--positive)]';

  const MissingDot = () => (
    <span className="inline-block w-1.5 h-1.5 bg-[var(--negative)] animate-pulse rounded-full ml-1.5" />
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className={`border-l-2 pl-3 ${headerBorderColor}`}>
            <h2 className="text-lg font-semibold">
              Confirm:{' '}
              <span className={headerTextColor}>
                {actionLabel}
              </span>{' '}
              {isAddCash ? cashCurrency : isSetPrice ? symbol : isUpdateCash ? '' : symbol}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary banner */}
        <div className={`p-3 mb-4 text-[13px] flex items-center gap-2 ${bannerBg}`}>
          <ActionIcon className={`w-4 h-4 flex-shrink-0 ${actionIconColor}`} />
          {parsedAction.summary}
        </div>

        {/* Position selector if ambiguous (for sell/remove) */}
        {(isSell || isRemove) && symbolMatches.length > 1 && (
          <div className="mb-4">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
              Multiple positions found — select one
            </label>
            <select
              value={matchedPositionId}
              onChange={(e) => setMatchedPositionId(e.target.value)}
              className="w-full"
            >
              {symbolMatches.map((p) => {
                const acct = p.accountId ? store.accounts.find(a => a.id === p.accountId) : null;
                const label = acct
                  ? (acct.connection.dataSource === 'debank' || acct.connection.dataSource === 'helius')
                    ? ` (wallet: ${(acct.connection as WalletConnection).address.slice(0, 6)}...)`
                    : ` (${acct.name})`
                  : p.protocol ? ` (${p.protocol})` : ' (manual)';
                return (
                  <option key={p.id} value={p.id}>
                    {p.symbol.toUpperCase()} — {formatNumber(p.amount)} units{label}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
          {/* ===== SELL FIELDS ===== */}
          {isSell && (
            <>
              {action === 'sell_partial' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                      Sell % of position
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      placeholder="e.g., 50"
                      value={sellPercent}
                      onChange={(e) => handleSellPercentChange(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                      Sell amount (units)
                      {missingFields.includes('sellAmount') && (
                        <>
                          <MissingDot />
                          <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                        </>
                      )}
                    </label>
                    <input
                      ref={
                        missingFields[0] === 'sellAmount'
                          ? firstMissingRef
                          : undefined
                      }
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={sellAmount}
                      onChange={(e) => setSellAmount(e.target.value)}
                      className={`w-full ${
                        missingFields.includes('sellAmount')
                          ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                          : ''
                      }`}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  Sale price per unit ($)
                  {missingFields.includes('sellPrice') && (
                    <>
                      <MissingDot />
                      <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                    </>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={
                      missingFields[0] === 'sellPrice'
                        ? firstMissingRef
                        : undefined
                    }
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className={`w-full ${
                      missingFields.includes('sellPrice')
                        ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                        : ''
                    }`}
                  />
                  {matchedWithPrice && matchedWithPrice.currentPrice > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSellPrice(matchedWithPrice.currentPrice.toString())
                      }
                      className="px-2 py-1 text-[11px] bg-[var(--background-tertiary)] border border-[var(--border)] hover:border-[var(--accent-primary)] transition-colors whitespace-nowrap"
                    >
                      Use {formatCurrency(matchedWithPrice.currentPrice)}
                    </button>
                  )}
                </div>
              </div>

              {/* Account context for sell */}
              {matchedPosition?.accountId && (() => {
                const acct = store.accounts.find(a => a.id === matchedPosition.accountId);
                return acct ? (
                  <div className="text-xs text-[var(--foreground-muted)]">
                    Account: {acct.name}
                  </div>
                ) : null;
              })()}
            </>
          )}

          {/* ===== BUY FIELDS ===== */}
          {isBuy && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Amount (units)
                    {missingFields.includes('amount') && (
                      <>
                        <MissingDot />
                        <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                      </>
                    )}
                  </label>
                  <input
                    ref={
                      missingFields[0] === 'amount'
                        ? firstMissingRef
                        : undefined
                    }
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`w-full ${
                      missingFields.includes('amount')
                        ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                        : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Price per unit ($)
                    {missingFields.includes('pricePerUnit') && (
                      <>
                        <MissingDot />
                        <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                      </>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={
                        missingFields[0] === 'pricePerUnit'
                          ? firstMissingRef
                          : undefined
                      }
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      className={`w-full ${
                        missingFields.includes('pricePerUnit')
                          ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                          : ''
                      }`}
                    />
                    {matchedWithPrice && matchedWithPrice.currentPrice > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPricePerUnit(
                            matchedWithPrice.currentPrice.toString()
                          )
                        }
                        className="px-2 py-1 text-[11px] bg-[var(--background-tertiary)] border border-[var(--border)] hover:border-[var(--accent-primary)] transition-colors whitespace-nowrap"
                      >
                        Use {formatCurrency(matchedWithPrice.currentPrice)}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Account selector (for buy actions with available accounts) */}
              {relevantAccounts.length > 0 && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">No account</option>
                    {relevantAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Existing position: add-to or create separate */}
              {matchedPosition && (
                <div className="p-3 bg-[var(--background-secondary)]">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                    You already hold {formatNumber(matchedPosition.amount)}{' '}
                    {symbol}
                  </p>
                  <div className="bg-[var(--background-secondary)] p-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAddToExisting(true)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        addToExisting
                          ? 'bg-[var(--card-bg)] shadow-sm'
                          : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      Add to existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddToExisting(false)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        !addToExisting
                          ? 'bg-[var(--card-bg)] shadow-sm'
                          : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      Create separate
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== ADD CASH FIELDS ===== */}
          {isAddCash && (
            <>
              {/* Account selector: dropdown of existing accounts + New account */}
              {allCashPositions.length > 0 && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Account
                  </label>
                  <select
                    value={matchedPositionId || '__new__'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        setMatchedPositionId('');
                        setAccountName('');
                        setCashCurrency(parsedAction.currency || 'USD');
                      } else {
                        const pos = allCashPositions.find(p => p.id === val);
                        if (pos) {
                          setMatchedPositionId(pos.id);
                          const currMatch = pos.symbol.match(/CASH_([A-Z]{3})/);
                          setCashCurrency(currMatch ? currMatch[1] : 'USD');
                          const acct = (pos as Position & { accountName?: string }).accountName
                            || pos.name.match(/^(.+?)\s*\(/)?.[1]
                            || pos.name;
                          setAccountName(acct);
                        }
                      }
                    }}
                    className="w-full"
                  >
                    {allCashPositions.map((p) => {
                      const currMatch = p.symbol.match(/CASH_([A-Z]{3})/);
                      const cur = currMatch ? currMatch[1] : 'USD';
                      const acct = (p as Position & { accountName?: string }).accountName
                        || p.name.match(/^(.+?)\s*\(/)?.[1]
                        || p.name;
                      return (
                        <option key={p.id} value={p.id}>
                          {acct} ({cur}) — {formatNumber(p.amount)} {cur}
                        </option>
                      );
                    })}
                    <option value="__new__">+ New account</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Amount
                    {missingFields.includes('amount') && (
                      <>
                        <MissingDot />
                        <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                      </>
                    )}
                  </label>
                  <input
                    ref={missingFields[0] === 'amount' ? firstMissingRef : undefined}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`w-full ${
                      missingFields.includes('amount')
                        ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                        : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Currency
                    {missingFields.includes('currency') && (
                      <>
                        <MissingDot />
                        <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                      </>
                    )}
                  </label>
                  <select
                    value={cashCurrency}
                    onChange={(e) => setCashCurrency(e.target.value)}
                    className="w-full"
                    disabled={!!matchedPositionId}
                  >
                    {FIAT_CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Account name: only shown for new accounts (no matchedPositionId) */}
              {!matchedPositionId && (
                <div>
                  <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Account Name
                    {missingFields.includes('accountName') && (
                      <>
                        <MissingDot />
                        <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                      </>
                    )}
                  </label>
                  <input
                    ref={missingFields[0] === 'accountName' ? firstMissingRef : undefined}
                    type="text"
                    placeholder="e.g., Revolut, IBKR"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className={`w-full ${
                      missingFields.includes('accountName')
                        ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                        : ''
                    }`}
                  />
                </div>
              )}
            </>
          )}

          {/* ===== REMOVE FIELDS ===== */}
          {isRemove && (
            <>
              {symbolMatches.length > 0 ? (
                <div className="p-3 bg-[var(--background-secondary)]">
                  {symbolMatches.map((p) => {
                    const withPrice = positionsWithPrices.find(pw => pw.id === p.id);
                    const acct = p.accountId ? store.accounts.find(a => a.id === p.accountId) : null;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm py-1">
                        <div>
                          <span className="font-medium">{p.symbol.toUpperCase()}</span>
                          <span className="text-[var(--foreground-muted)] ml-2">{formatNumber(p.amount)} units</span>
                          {acct && (
                            <span className="text-[var(--foreground-muted)] ml-1">· {acct.name}</span>
                          )}
                        </div>
                        {withPrice && (
                          <span className="font-mono text-sm">{formatCurrency(withPrice.value)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-[var(--negative-light)] text-[13px] text-[var(--negative)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  No position found for {symbol}
                </div>
              )}
              <div className="p-3 bg-[var(--negative-light)] text-[13px] text-[var(--negative)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                This action cannot be undone
              </div>
            </>
          )}

          {/* ===== UPDATE CASH FIELDS ===== */}
          {isUpdateCash && (
            <>
              {updateCashCandidates.length > 1 && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Select cash position
                  </label>
                  <select
                    value={matchedPositionId}
                    onChange={(e) => setMatchedPositionId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">Select...</option>
                    {updateCashCandidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatNumber(p.amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bank account selector */}
              {relevantAccounts.length > 0 && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">No account</option>
                    {relevantAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  New Balance
                  {missingFields.includes('amount') && (
                    <>
                      <MissingDot />
                      <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                    </>
                  )}
                </label>
                <input
                  ref={missingFields[0] === 'amount' ? firstMissingRef : undefined}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`w-full ${
                    missingFields.includes('amount')
                      ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                      : ''
                  }`}
                />
              </div>

              {/* Before → After preview */}
              {updateCashMatched && numAmount > 0 && (
                <div className="p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                    Balance Change
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">
                      {updateCashMatched.name}
                      {updateCashMatched.accountId && (() => {
                        const acct = store.accounts.find(a => a.id === updateCashMatched.accountId);
                        return acct ? ` · ${acct.name}` : '';
                      })()}
                    </span>
                    <div className="font-mono">
                      <span>{formatNumber(updateCashMatched.amount)}</span>
                      <span className="text-[var(--foreground-muted)] mx-2">→</span>
                      <span>{formatNumber(numAmount)}</span>
                    </div>
                  </div>
                  {(() => {
                    const diff = numAmount - updateCashMatched.amount;
                    const color = diff >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
                    return (
                      <div className="flex justify-end mt-1">
                        <span className={`text-xs font-mono ${color}`}>
                          {diff >= 0 ? '+' : ''}{formatNumber(diff)} {cashCurrency}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {/* ===== SET PRICE FIELDS ===== */}
          {isSetPrice && (
            <>
              <div>
                <label className="flex items-center text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  New Price ($)
                  {missingFields.includes('newPrice') && (
                    <>
                      <MissingDot />
                      <span className="text-[10px] uppercase text-[var(--negative)] ml-1">Required</span>
                    </>
                  )}
                </label>
                <input
                  ref={missingFields[0] === 'newPrice' ? firstMissingRef : undefined}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className={`w-full ${
                    missingFields.includes('newPrice')
                      ? 'border-[var(--negative)] bg-[var(--negative-light)]'
                      : ''
                  }`}
                />
              </div>

              {/* Current vs new price comparison */}
              {setPriceAffectedPositions.length > 0 && numNewPrice > 0 && (
                <div className="p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                    Affected Positions
                  </p>
                  <div className="space-y-2">
                    {setPriceAffectedPositions.map((p) => {
                      const oldValue = p.value;
                      const newValue = p.amount * numNewPrice;
                      const diff = newValue - oldValue;
                      const diffColor = diff >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
                      return (
                        <div key={p.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[var(--foreground-muted)]">
                              {formatNumber(p.amount)} {symbol}
                              {p.accountId && (() => {
                                const acct = store.accounts.find(a => a.id === p.accountId);
                                return acct ? ` · ${acct.name}` : '';
                              })()}
                            </span>
                            <div className="font-mono text-xs">
                              <span>{formatCurrency(oldValue)}</span>
                              <span className="text-[var(--foreground-muted)] mx-2">→</span>
                              <span>{formatCurrency(newValue)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--foreground-muted)]">Price</span>
                            <div className="font-mono">
                              <span>{formatCurrency(p.currentPrice)}</span>
                              <span className="text-[var(--foreground-muted)] mx-2">→</span>
                              <span>{formatCurrency(numNewPrice)}</span>
                              <span className={`ml-2 ${diffColor}`}>
                                ({diff >= 0 ? '+' : ''}{formatCurrency(diff)})
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--foreground-muted)] mt-3">
                    Custom prices override market prices until removed
                  </p>
                </div>
              )}
            </>
          )}

          {/* ===== UPDATE POSITION FIELDS ===== */}
          {isUpdatePosition && matchedPosition && (
            <>
              {/* Account selector for update_position */}
              {relevantAccounts.length > 0 && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                    Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full"
                  >
                    <option value="">No account</option>
                    {relevantAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  Amount
                </label>
                <input
                  ref={firstMissingRef}
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Current: {formatNumber(matchedPosition.amount)}
                </p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  Cost Basis ($)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={editCostBasis}
                  onChange={(e) => setEditCostBasis(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Current: {matchedPosition.costBasis != null ? formatCurrency(matchedPosition.costBasis) : 'Not set'}
                </p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={editPurchaseDate}
                  onChange={(e) => setEditPurchaseDate(e.target.value)}
                  className="w-full"
                  max={new Date().toISOString().split('T')[0]}
                />
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Current: {matchedPosition.purchaseDate || 'Not set'}
                </p>
              </div>
            </>
          )}

          {/* Date (only for buy/sell) */}
          {(isBuy || isSell) && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          {/* Notes (only for buy/sell) */}
          {(isBuy || isSell) && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Tax-loss harvest"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Execution Preview (buy/sell only) */}
        {((isSell && matchedPosition && effectiveSellAmount > 0) || (isBuy && numAmount > 0 && numPricePerUnit > 0)) && (
          <div className="mt-4 bg-[var(--card-bg)] border border-[var(--card-border)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
              Execution Preview
            </p>
            <div className="space-y-1.5">
              {/* Position line */}
              {isSell && matchedPosition && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">{symbol} Position</span>
                    <div className="font-mono">
                      <span className="text-[var(--negative)]">-{formatNumber(effectiveSellAmount)}</span>
                      <span className="text-xs text-[var(--foreground-muted)] ml-2">
                        {formatNumber(matchedPosition.amount)} → {formatNumber(afterAmount)}
                      </span>
                    </div>
                  </div>
                  {sellPercentOfPosition > 0 && (
                    <div className="flex justify-end">
                      <span className="text-xs text-[var(--foreground-muted)]">
                        ({Math.round(sellPercentOfPosition)}% of holdings)
                      </span>
                    </div>
                  )}
                </>
              )}
              {isBuy && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--foreground-muted)]">{symbol} Position</span>
                  <div className="font-mono">
                    <span className="text-[var(--positive)]">+{formatNumber(numAmount)}</span>
                    {matchedPosition && addToExisting && (
                      <span className="text-xs text-[var(--foreground-muted)] ml-2">
                        {formatNumber(matchedPosition.amount)} → {formatNumber(matchedPosition.amount + numAmount)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Exec price */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Exec Price</span>
                <span className="font-mono">
                  {formatCurrency(isSell ? numSellPrice : numPricePerUnit)} / unit
                </span>
              </div>

              {/* Proceeds (sell) or Total Cost (buy) */}
              {isSell && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--foreground-muted)]">Proceeds</span>
                  <span className="font-mono">{formatCurrency(effectiveSellTotal)}</span>
                </div>
              )}
              {isBuy && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--foreground-muted)]">Total Cost</span>
                  <span className="font-mono">{formatCurrency(buyTotal)}</span>
                </div>
              )}

              {/* Cost basis section for sells */}
              {isSell && costBasisAtExecution !== undefined && (
                <>
                  <div className="border-t border-[var(--card-border)] my-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">Cost Basis Sold</span>
                    <span className="font-mono">{formatCurrency(costBasisAtExecution)}</span>
                  </div>
                  {action !== 'sell_all' && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--foreground-muted)]">Cost Basis Left</span>
                      <span className="font-mono">{formatCurrency(afterCostBasis)}</span>
                    </div>
                  )}
                  {/* P&L highlight */}
                  {realizedPnL !== undefined && numSellPrice > 0 && (
                    <div className={`flex items-center justify-between p-2 mt-1.5 ${
                      realizedPnL >= 0
                        ? 'bg-[var(--positive-light)]'
                        : 'bg-[var(--negative-light)]'
                    }`}>
                      <span className="text-xs font-medium flex items-center gap-1">
                        {realizedPnL >= 0 ? (
                          <TrendingUp className="w-3 h-3 text-[var(--positive)]" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-[var(--negative)]" />
                        )}
                        Realized P&L
                      </span>
                      <span className={`text-sm font-semibold font-mono ${
                        realizedPnL >= 0
                          ? 'text-[var(--positive)]'
                          : 'text-[var(--negative)]'
                      }`}>
                        {realizedPnL >= 0 ? '+' : ''}{formatCurrency(realizedPnL)}
                        {realizedPnLPercent !== null && ` (${formatPercent(realizedPnLPercent)})`}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Cost basis section for buys (add to existing) */}
              {isBuy && matchedPosition && addToExisting && matchedPosition.costBasis !== undefined && (
                <>
                  <div className="border-t border-[var(--card-border)] my-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">Cost Basis</span>
                    <span className="font-mono text-xs">
                      {formatCurrency(matchedPosition.costBasis)} → {formatCurrency(newCostBasisAfterBuy)}
                    </span>
                  </div>
                  {currentAvgCost !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--foreground-muted)]">Avg Cost / Unit</span>
                      <span className="font-mono text-xs">
                        {formatCurrency(currentAvgCost)} → {formatCurrency(newAvgCostAfterBuy)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Cash section */}
              {previewBrokerageId !== null && (
                <>
                  <div className="border-t border-[var(--card-border)] my-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground-muted)]">Cash (USD)</span>
                    <span className="font-mono">
                      {isSell ? (
                        <span className="text-[var(--positive)]">+{formatCurrency(effectiveSellTotal)}</span>
                      ) : (
                        <span className="text-[var(--negative)]">-{formatCurrency(buyTotal)}</span>
                      )}
                    </span>
                  </div>
                  {currentCashBalance !== null && (
                    <div className="flex justify-end">
                      <span className="text-xs text-[var(--foreground-muted)] font-mono">
                        {formatCurrency(currentCashBalance)} → {formatCurrency(
                          isSell
                            ? currentCashBalance + effectiveSellTotal
                            : currentCashBalance - buyTotal
                        )}
                      </span>
                    </div>
                  )}
                  {/* Negative cash warning */}
                  {projectedCashBalance !== null && projectedCashBalance < 0 && (
                    <div className="mt-1.5 text-xs text-[var(--warning)] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Projected balance is negative ({formatCurrency(projectedCashBalance)})
                    </div>
                  )}
                  {/* Account name */}
                  {previewBrokerageAccount !== null && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-[var(--foreground-muted)]">Account</span>
                      <span className="text-xs">{previewBrokerageAccount.name}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Add Cash preview */}
        {isAddCash && numAmount > 0 && matchedPositionId && (() => {
          const previewPos = positions.find(p => p.id === matchedPositionId);
          return previewPos ? (
            <div className="mt-4 bg-[var(--card-bg)] border border-[var(--card-border)] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-3">
                Preview
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">{previewPos.name}</span>
                <div className="font-mono text-xs">
                  <span>{formatNumber(previewPos.amount)}</span>
                  <span className="text-[var(--foreground-muted)] mx-2">→</span>
                  <span>{formatNumber(previewPos.amount + numAmount)}</span>
                  <span className="text-[var(--positive)] ml-2">+{formatNumber(numAmount)}</span>
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* Error */}
        {error && (
          <div className="mt-3 p-3 bg-[var(--negative-light)] border border-[rgba(201,123,123,0.2)] text-[var(--negative)] text-[13px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting || (isRemove && symbolMatches.length === 0)}
            className={`btn flex-1 ${
              isRemove
                ? 'btn-danger'
                : isSell
                ? 'btn-danger'
                : 'btn-primary'
            } ${!canConfirm || isSubmitting || (isRemove && symbolMatches.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
