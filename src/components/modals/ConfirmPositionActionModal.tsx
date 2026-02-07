'use client';

import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { ParsedPositionAction, Position, AssetWithPrice } from '@/types';
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

export default function ConfirmPositionActionModal({
  isOpen,
  onClose,
  parsedAction,
  positions,
  positionsWithPrices,
}: ConfirmPositionActionModalProps) {
  const { updatePosition, removePosition, addPosition, addTransaction, updatePrice, brokerageAccounts } =
    usePortfolioStore();

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
    }
  }, [isOpen, parsedAction, positionsWithPrices]);

  // Auto-focus first missing field
  useEffect(() => {
    if (isOpen && firstMissingRef.current) {
      setTimeout(() => firstMissingRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isSell = action === 'sell_partial' || action === 'sell_all';
  const isBuy = action === 'buy';

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

  const sellTotal = numSellAmount * numSellPrice;
  const effectiveSellTotal = action === 'sell_all' && matchedPosition
    ? matchedPosition.amount * numSellPrice
    : sellTotal;
  const buyTotal = numAmount * numPricePerUnit;

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
  if (isBuy && !numAmount) missingFields.push('amount');
  if (isBuy && numPricePerUnit <= 0) missingFields.push('pricePerUnit');

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

  // Determine brokerage account ID from the matched position's protocol
  const brokerageAccountId = matchedPosition?.protocol?.startsWith('brokerage:')
    ? matchedPosition.protocol.replace('brokerage:', '')
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
      ? (addToExisting && matchedPosition?.protocol?.startsWith('brokerage:')
        ? matchedPosition.protocol.replace('brokerage:', '')
        : (parsedAction.assetType === 'stock' || parsedAction.assetType === 'etf') && brokerageAccounts.length > 0
          ? brokerageAccounts[0].id
          : null)
      : null;

  const previewCashPosition = previewBrokerageId
    ? positions.find(p => p.type === 'cash' && p.protocol === `brokerage:${previewBrokerageId}`)
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

  // Cash side-effect: update or create cash position in the same brokerage account.
  // Returns true if a warning was shown (caller should NOT close the modal).
  const handleCashSideEffect = (cashDelta: number, accountId: string | null): boolean => {
    if (!accountId) return false;

    const protocol = `brokerage:${accountId}`;
    const existingCash = positions.find(
      (p) => p.type === 'cash' && p.protocol === protocol
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
        type: 'cash',
        symbol: cashSymbol,
        name: 'Cash (USD)',
        amount: cashDelta,
        costBasis: cashDelta,
        protocol,
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

        // Determine brokerage protocol for new buys
        const buyBrokerageProtocol = existingPos?.protocol?.startsWith('brokerage:')
          ? existingPos.protocol
          : (parsedAction.assetType === 'stock' || parsedAction.assetType === 'etf') && brokerageAccounts.length > 0
          ? `brokerage:${brokerageAccounts[0].id}`
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
            ...(buyBrokerageProtocol ? { protocol: buyBrokerageProtocol } : {}),
          });
        }

        // Cash side-effect: deduct cost
        const effectiveBrokerageId = existingPos?.protocol?.startsWith('brokerage:')
          ? existingPos.protocol.replace('brokerage:', '')
          : buyBrokerageProtocol?.replace('brokerage:', '');

        const warned = handleCashSideEffect(-result.transaction.totalValue, effectiveBrokerageId ?? null);
        if (warned) return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const actionLabel = isSell ? 'Sell' : isBuy ? 'Buy' : 'Update';

  // Build a descriptive confirm button label
  const confirmLabel = isSell
    ? matchedPosition
      ? `Sell ${formatNumber(effectiveSellAmount)} ${symbol} (${Math.round(sellPercentOfPosition)}%)`
      : `Sell ${symbol}`
    : isBuy
    ? `Buy ${numAmount > 0 ? formatNumber(numAmount) + ' ' : ''}${symbol}`
    : actionLabel;

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
          <div className={`border-l-2 pl-3 ${isSell ? 'border-[var(--negative)]' : 'border-[var(--positive)]'}`}>
            <h2 className="text-lg font-semibold">
              Confirm:{' '}
              <span className={isSell ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}>
                {actionLabel}
              </span>{' '}
              {symbol}
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
        <div className={`p-3 mb-4 text-[13px] flex items-center gap-2 ${
          isSell
            ? 'bg-[var(--negative-light)]'
            : 'bg-[var(--positive-light)]'
        }`}>
          {isSell ? (
            <TrendingDown className={`w-4 h-4 flex-shrink-0 text-[var(--negative)]`} />
          ) : (
            <TrendingUp className={`w-4 h-4 flex-shrink-0 text-[var(--positive)]`} />
          )}
          {parsedAction.summary}
        </div>

        {/* Position selector if ambiguous */}
        {symbolMatches.length > 1 && (
          <div className="mb-4">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
              Multiple positions found — select one
            </label>
            <select
              value={matchedPositionId}
              onChange={(e) => setMatchedPositionId(e.target.value)}
              className="w-full"
            >
              {symbolMatches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.symbol.toUpperCase()} — {formatNumber(p.amount)} units
                  {p.walletAddress
                    ? ` (wallet: ${p.walletAddress.slice(0, 6)}...)`
                    : p.protocol
                    ? ` (${p.protocol})`
                    : ' (manual)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
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
            </>
          )}

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

          {/* Date */}
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

          {/* Notes */}
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
        </div>

        {/* Execution Preview */}
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
            disabled={!canConfirm || isSubmitting}
            className={`btn flex-1 ${
              isSell
                ? 'btn-danger'
                : 'btn-primary'
            } ${!canConfirm || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
