'use client';

import { useState, useEffect } from 'react';
import { X, DollarSign, Trash2 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { formatCurrency } from '@/lib/utils';

interface CustomPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  name: string;
  currentMarketPrice: number;
  currentCustomPrice?: number;
  currentNote?: string;
}

export default function CustomPriceModal({
  isOpen,
  onClose,
  symbol,
  name,
  currentMarketPrice,
  currentCustomPrice,
  currentNote,
}: CustomPriceModalProps) {
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');

  const { setCustomPrice, removeCustomPrice } = usePortfolioStore();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPrice(currentCustomPrice?.toString() || '');
      setNote(currentNote || '');
    }
  }, [isOpen, currentCustomPrice, currentNote]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const priceValue = parseFloat(price);
    if (isNaN(priceValue) || priceValue < 0) return;

    setCustomPrice(symbol, priceValue, note || undefined);
    onClose();
  };

  const handleRemove = () => {
    removeCustomPrice(symbol);
    onClose();
  };

  const handleUseMarketPrice = () => {
    setPrice(currentMarketPrice.toString());
  };

  if (!isOpen) return null;

  const hasCustomPrice = currentCustomPrice !== undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--accent-primary)]  flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Set Custom Price</h2>
              <p className="text-sm text-[var(--foreground-muted)]">
                {symbol.toUpperCase()} - {name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)]  transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Market price info */}
        <div className="p-3 bg-[var(--background-secondary)]  mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--foreground-muted)]">Market Price</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">
                {currentMarketPrice > 0 ? formatCurrency(currentMarketPrice) : 'N/A'}
              </span>
              {currentMarketPrice > 0 && (
                <button
                  type="button"
                  onClick={handleUseMarketPrice}
                  className="text-xs text-[var(--accent-primary)] hover:underline"
                >
                  Use
                </button>
              )}
            </div>
          </div>
          {hasCustomPrice && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
              <span className="text-sm text-[var(--foreground-muted)]">Current Custom</span>
              <span className="font-mono font-medium text-[var(--accent-primary)]">
                {formatCurrency(currentCustomPrice)}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Custom Price (USD)</label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Enter custom price..."
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full font-mono"
              autoFocus
              required
            />
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Custom prices override market prices for this asset
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Note (optional)</label>
            <input
              type="text"
              placeholder="e.g., OTC deal, locked tokens, vesting..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="form-input w-full"
            />
          </div>

          <div className="flex gap-3 pt-4">
            {hasCustomPrice && (
              <button
                type="button"
                onClick={handleRemove}
                className="btn btn-secondary flex items-center gap-2 text-[var(--negative)]"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={!price || parseFloat(price) < 0}
            >
              {hasCustomPrice ? 'Update' : 'Set'} Price
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
