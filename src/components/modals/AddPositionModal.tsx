'use client';

import { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { searchCoins, getTopCoins, searchStocks } from '@/services';
import { useRefresh } from '@/components/PortfolioProvider';
import { AssetType } from '@/types';

interface AddPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'crypto' | 'stock' | 'cash' | 'manual';

export default function AddPositionModal({
  isOpen,
  onClose,
}: AddPositionModalProps) {
  const [tab, setTab] = useState<Tab>('crypto');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [amount, setAmount] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [cashAccountName, setCashAccountName] = useState('');
  const [cashCurrency, setCashCurrency] = useState('USD');
  const [cashBalance, setCashBalance] = useState('');

  const { addPosition, updatePrice } = usePortfolioStore();
  const { refresh } = useRefresh();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedAsset(null);
      setAmount('');
      setCostBasis('');
      setManualSymbol('');
      setManualName('');
      setManualPrice('');
      setCashAccountName('');
      setCashCurrency('USD');
      setCashBalance('');
    }
  }, [isOpen]);

  // Search debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (tab === 'crypto') {
          const results = await searchCoins(searchQuery);
          setSearchResults(results);
        } else if (tab === 'stock') {
          const results = await searchStocks(searchQuery);
          setSearchResults(results);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, tab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (tab === 'cash') {
      if (!cashAccountName || !cashBalance) return;

      const symbol = `CASH_${cashCurrency}_${Date.now()}`;
      addPosition({
        type: 'cash',
        symbol,
        name: `${cashAccountName} (${cashCurrency})`,
        amount: parseFloat(cashBalance),
        costBasis: parseFloat(cashBalance), // Cost basis equals balance for cash
      });

      // Cash price is always 1 (1 USD = 1 USD)
      updatePrice(symbol.toLowerCase(), {
        symbol: cashCurrency,
        price: 1,
        change24h: 0,
        changePercent24h: 0,
        lastUpdated: new Date().toISOString(),
      });
    } else if (tab === 'manual') {
      if (!manualSymbol || !manualName || !amount || !manualPrice) return;

      addPosition({
        type: 'manual',
        symbol: manualSymbol.toUpperCase(),
        name: manualName,
        amount: parseFloat(amount),
        costBasis: costBasis ? parseFloat(costBasis) : undefined,
      });

      // Set price for manual asset
      updatePrice(manualSymbol.toLowerCase(), {
        symbol: manualSymbol.toUpperCase(),
        price: parseFloat(manualPrice),
        change24h: 0,
        changePercent24h: 0,
        lastUpdated: new Date().toISOString(),
      });
    } else {
      if (!selectedAsset || !amount) return;

      const type: AssetType = tab;
      const symbol = tab === 'crypto' ? selectedAsset.symbol : selectedAsset.symbol;
      const name = tab === 'crypto' ? selectedAsset.name : selectedAsset.description;

      addPosition({
        type,
        symbol,
        name,
        amount: parseFloat(amount),
        costBasis: costBasis ? parseFloat(costBasis) : undefined,
      });

      // Trigger refresh to fetch price for the new position
      refresh();
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Position</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['crypto', 'stock', 'cash', 'manual'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setSearchQuery('');
                setSearchResults([]);
                setSelectedAsset(null);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--tag-bg)] text-[var(--tag-text)] hover:bg-[var(--border)]'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'cash' ? (
            <>
              {/* Cash account inputs */}
              <div>
                <label className="block text-sm font-medium mb-1">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g., Revolut, Chase Savings"
                  value={cashAccountName}
                  onChange={(e) => setCashAccountName(e.target.value)}
                  className="w-full"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Currency</label>
                  <select
                    value={cashCurrency}
                    onChange={(e) => setCashCurrency(e.target.value)}
                    className="w-full"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CHF">CHF</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Balance</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={cashBalance}
                    onChange={(e) => setCashBalance(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
              </div>
            </>
          ) : tab !== 'manual' ? (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                <input
                  type="text"
                  placeholder={`Search ${tab === 'crypto' ? 'cryptocurrencies' : 'stocks'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--foreground-muted)]" />
                )}
              </div>

              {/* Search results */}
              {searchResults.length > 0 && !selectedAsset && (
                <div className="border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={tab === 'crypto' ? result.id : result.symbol}
                      type="button"
                      onClick={() => setSelectedAsset(result)}
                      className="w-full px-4 py-3 text-left hover:bg-[var(--background-secondary)] flex items-center gap-3 transition-colors"
                    >
                      {tab === 'crypto' && result.image && (
                        <img
                          src={result.image}
                          alt={result.symbol}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {tab === 'crypto' ? result.symbol.toUpperCase() : result.symbol}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {tab === 'crypto' ? result.name : result.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected asset */}
              {selectedAsset && (
                <div className="p-3 bg-[var(--background-secondary)] rounded-lg flex items-center gap-3">
                  {tab === 'crypto' && selectedAsset.image && (
                    <img
                      src={selectedAsset.image}
                      alt={selectedAsset.symbol}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {tab === 'crypto'
                        ? selectedAsset.symbol.toUpperCase()
                        : selectedAsset.symbol}
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {tab === 'crypto' ? selectedAsset.name : selectedAsset.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(null)}
                    className="p-1 hover:bg-[var(--border)] rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual asset inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g., GOLD"
                    value={manualSymbol}
                    onChange={(e) => setManualSymbol(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Gold"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Price per unit (USD)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className="w-full"
                  required
                />
              </div>
            </>
          )}

          {/* Amount and cost basis - not shown for cash */}
          {tab !== 'cash' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Cost basis (optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Total cost in USD"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Submit button */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={
                tab === 'cash'
                  ? !cashAccountName || !cashBalance
                  : tab === 'manual'
                  ? !manualSymbol || !manualName || !amount || !manualPrice
                  : !selectedAsset || !amount
              }
            >
              Add Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
