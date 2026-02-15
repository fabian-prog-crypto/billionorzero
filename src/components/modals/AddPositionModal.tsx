'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Loader2, Plus } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { searchCoins, searchStocks, extractCurrencyCode, isManualAccountNameTaken, getCategoryService } from '@/services';
import StockIcon from '@/components/ui/StockIcon';
import { useRefresh } from '@/components/PortfolioProvider';
import { AssetType } from '@/types';
import { FIAT_CURRENCIES, COMMON_CURRENCY_CODES, FIAT_CURRENCY_MAP } from '@/lib/currencies';
import { formatNumber } from '@/lib/utils';

interface AddPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'crypto' | 'stock' | 'cash' | 'manual';
}

type Tab = 'crypto' | 'stock' | 'cash' | 'manual';
type EquityType = 'stock' | 'etf';
type SearchResult = {
  id?: string;
  symbol: string;
  name?: string;
  description?: string;
  image?: string;
};

export default function AddPositionModal({
  isOpen,
  onClose,
  defaultTab,
}: AddPositionModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab || 'crypto');
  const [equityType, setEquityType] = useState<EquityType>('stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SearchResult | null>(null);
  const [amount, setAmount] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [cashCurrency, setCashCurrency] = useState('USD');
  const [cashBalance, setCashBalance] = useState('');
  const [selectedBrokerageId, setSelectedBrokerageId] = useState('');

  // Cash account state
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('');
  const [newCashAccountName, setNewCashAccountName] = useState('');
  const [isCreatingNewAccount, setIsCreatingNewAccount] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const currencyPickerRef = useRef<HTMLDivElement>(null);

  const store = usePortfolioStore();
  const { addPosition, updatePosition, updatePrice, addAccount, positions, accounts } = store;
  const { refresh } = useRefresh();
  const categoryService = getCategoryService();

  // Get accounts using new API - memoize to avoid infinite useEffect loops
  const brokerageAccounts = useMemo(() => store.brokerageAccounts(), [store, accounts]);
  const manualAccounts = useMemo(() => store.manualAccounts(), [store, accounts]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab || 'crypto');
      setEquityType('stock');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedAsset(null);
      setAmount('');
      setCostBasis('');
      setPurchaseDate('');
      setManualSymbol('');
      setManualName('');
      setManualPrice('');
      setCashCurrency('USD');
      setCashBalance('');
      setSelectedBrokerageId(brokerageAccounts.length === 1 ? brokerageAccounts[0].id : '');
      setSelectedCashAccountId(manualAccounts.length === 1 ? manualAccounts[0].id : '');
      setNewCashAccountName('');
      setIsCreatingNewAccount(manualAccounts.length === 0);
      setCurrencySearch('');
      setIsCurrencyPickerOpen(false);
    }
  }, [isOpen, defaultTab, brokerageAccounts, manualAccounts]);

  // Close currency picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (currencyPickerRef.current && !currencyPickerRef.current.contains(e.target as Node)) {
        setIsCurrencyPickerOpen(false);
      }
    }
    if (isCurrencyPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isCurrencyPickerOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose]);

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

  // Filtered currency list for picker
  const filteredCurrencies = useMemo(() => {
    const query = currencySearch.toLowerCase();
    const filtered = FIAT_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)
    );
    if (!currencySearch) return filtered;
    return filtered;
  }, [currencySearch]);

  // Currencies already held by the selected account
  const heldCurrencies = useMemo(() => {
    if (!selectedCashAccountId) return new Set<string>();
    const accountPositions = positions.filter(
      (p) => p.type === 'cash' && p.accountId === selectedCashAccountId
    );
    return new Set(accountPositions.map((p) => extractCurrencyCode(p.symbol)));
  }, [selectedCashAccountId, positions]);

  // Existing position for context banner
  const existingPosition = useMemo(() => {
    if (!selectedCashAccountId || !cashCurrency) return null;
    return positions.find(
      (p) =>
        p.type === 'cash' &&
        p.accountId === selectedCashAccountId &&
        extractCurrencyCode(p.symbol) === cashCurrency
    );
  }, [selectedCashAccountId, cashCurrency, positions]);

  // Check if new account name duplicates existing manual accounts (case-insensitive)
  const isDuplicateAccountName = useMemo(() => {
    if (!newCashAccountName.trim()) return false;
    return isManualAccountNameTaken(newCashAccountName.trim(), manualAccounts);
  }, [newCashAccountName, manualAccounts]);

  const selectedCurrencyInfo = FIAT_CURRENCY_MAP[cashCurrency];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (tab === 'cash') {
      let accountId = selectedCashAccountId;
      let accountName: string;

      if (isCreatingNewAccount) {
        if (!newCashAccountName.trim() || isDuplicateAccountName) return;
        accountId = addAccount({ name: newCashAccountName.trim(), isActive: true, connection: { dataSource: 'manual' } });
        accountName = newCashAccountName.trim();
      } else {
        if (!accountId) return;
        const account = manualAccounts.find((a) => a.id === accountId);
        if (!account) return;
        accountName = account.name;
      }

      if (!cashBalance || !cashCurrency) return;
      const cashAmount = parseFloat(cashBalance);
      if (!Number.isFinite(cashAmount) || cashAmount <= 0) return;

      if (existingPosition && existingPosition.accountId === accountId) {
        const nextAmount = existingPosition.amount + cashAmount;
        const nextCostBasis = (existingPosition.costBasis ?? existingPosition.amount) + cashAmount;

        updatePosition(existingPosition.id, {
          amount: nextAmount,
          costBasis: nextCostBasis,
          name: `${accountName} (${cashCurrency})`,
        });

        updatePrice(existingPosition.symbol.toLowerCase(), {
          symbol: cashCurrency,
          price: 1,
          change24h: 0,
          changePercent24h: 0,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        const symbol = `CASH_${cashCurrency}_${Date.now()}`;
        addPosition({
          assetClass: 'cash',
          type: 'cash',
          symbol,
          name: `${accountName} (${cashCurrency})`,
          amount: cashAmount,
          costBasis: cashAmount,
          accountId: accountId,
        });

        updatePrice(symbol.toLowerCase(), {
          symbol: cashCurrency,
          price: 1,
          change24h: 0,
          changePercent24h: 0,
          lastUpdated: new Date().toISOString(),
        });
      }
    } else if (tab === 'manual') {
      if (!manualSymbol || !manualName || !amount || !manualPrice) return;

      addPosition({
        assetClass: categoryService.getAssetClass(manualSymbol, 'manual'),
        type: 'manual',
        symbol: manualSymbol.toUpperCase(),
        name: manualName,
        amount: parseFloat(amount),
        costBasis: costBasis ? parseFloat(costBasis) : undefined,
        purchaseDate: purchaseDate || undefined,
      });

      updatePrice(manualSymbol.toLowerCase(), {
        symbol: manualSymbol.toUpperCase(),
        price: parseFloat(manualPrice),
        change24h: 0,
        changePercent24h: 0,
        lastUpdated: new Date().toISOString(),
      });
    } else {
      if (!selectedAsset || !amount) return;
      if (tab === 'stock' && brokerageAccounts.length > 1 && !selectedBrokerageId) return;

      const type: AssetType = tab === 'stock' ? equityType : tab;
      const symbol = selectedAsset.symbol;
      const name = tab === 'crypto'
        ? (selectedAsset.name || selectedAsset.symbol.toUpperCase())
        : (selectedAsset.description || selectedAsset.symbol);

      const brokerageAccountId = tab === 'stock' && brokerageAccounts.length > 0
        ? brokerageAccounts.length === 1
          ? brokerageAccounts[0].id
          : selectedBrokerageId || undefined
        : undefined;

      addPosition({
        assetClass: categoryService.getAssetClass(symbol, type),
        type,
        symbol,
        name,
        amount: parseFloat(amount),
        costBasis: costBasis ? parseFloat(costBasis) : undefined,
        purchaseDate: purchaseDate || undefined,
        ...(brokerageAccountId ? { accountId: brokerageAccountId } : {}),
      });

      refresh();
    }

    onClose();
  };

  const isCashSubmitDisabled =
    !cashBalance ||
    !cashCurrency ||
    (isCreatingNewAccount ? !newCashAccountName.trim() || isDuplicateAccountName : !selectedCashAccountId);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Position</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)]  transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['crypto', 'stock', 'cash', 'manual'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setSearchQuery('');
                setSearchResults([]);
                setSelectedAsset(null);
                setAmount('');
                setCostBasis('');
                setPurchaseDate('');
              }}
              className={`px-4 py-2  text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--tag-bg)] text-[var(--tag-text)] hover:bg-[var(--border)]'
              }`}
            >
              {t === 'stock' ? 'Equity' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Stock vs ETF toggle - only show when stock tab is selected */}
        {tab === 'stock' && (
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setEquityType('stock')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                equityType === 'stock'
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              Stock
            </button>
            <button
              type="button"
              onClick={() => setEquityType('etf')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                equityType === 'etf'
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              ETF
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brokerage account selector for equities with multiple accounts */}
          {tab === 'stock' && brokerageAccounts.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1">Brokerage Account</label>
              <select
                value={selectedBrokerageId}
                onChange={(e) => setSelectedBrokerageId(e.target.value)}
                className="form-input w-full"
              >
                <option value="">Select account...</option>
                {brokerageAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {tab === 'cash' ? (
            <>
              {/* Account selector */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Account</label>
                <div className="flex flex-wrap gap-2">
                  {manualAccounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedCashAccountId(a.id);
                        setIsCreatingNewAccount(false);
                      }}
                      className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        !isCreatingNewAccount && selectedCashAccountId === a.id
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--tag-bg)] text-[var(--tag-text)] hover:bg-[var(--border)]'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNewAccount(true);
                      setSelectedCashAccountId('');
                    }}
                    className={`px-3 py-1.5 text-[13px] font-medium transition-colors flex items-center gap-1 ${
                      isCreatingNewAccount
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--tag-bg)] text-[var(--tag-text)] hover:bg-[var(--border)]'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                </div>

                {/* New account name input */}
                {isCreatingNewAccount && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Account name (e.g., Revolut, Wise)"
                      value={newCashAccountName}
                      onChange={(e) => setNewCashAccountName(e.target.value)}
                      className="form-input w-full"
                      autoFocus
                    />
                    {isDuplicateAccountName && (
                      <p className="text-[11px] text-[var(--negative)] mt-1">
                        Account &quot;{newCashAccountName.trim()}&quot; already exists
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Currency picker */}
              <div ref={currencyPickerRef}>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Currency</label>
                <button
                  type="button"
                  onClick={() => setIsCurrencyPickerOpen(!isCurrencyPickerOpen)}
                  className="form-input w-full text-left flex items-center gap-2"
                >
                  {selectedCurrencyInfo && (
                    <span className="text-base">{selectedCurrencyInfo.flag}</span>
                  )}
                  <span className="font-medium text-sm">{cashCurrency}</span>
                  {selectedCurrencyInfo && (
                    <span className="text-[var(--foreground-muted)] text-xs">
                      {selectedCurrencyInfo.name}
                    </span>
                  )}
                </button>

                {isCurrencyPickerOpen && (
                  <div className="mt-1 border border-[var(--border)] bg-[var(--card-bg)]">
                    {/* Search input */}
                    <div className="relative p-2 border-b border-[var(--border)]">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                      <input
                        type="text"
                        placeholder="Search currencies..."
                        value={currencySearch}
                        onChange={(e) => setCurrencySearch(e.target.value)}
                        className="form-input w-full pl-8 text-sm"
                        autoFocus
                      />
                    </div>

                    {/* Currency list */}
                    <div className="max-h-48 overflow-y-auto">
                      {!currencySearch && (
                        <>
                          {/* Common currencies */}
                          {FIAT_CURRENCIES.filter((c) => COMMON_CURRENCY_CODES.includes(c.code)).map((c) => {
                            const isHeld = heldCurrencies.has(c.code);
                            return (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCashCurrency(c.code);
                                  setIsCurrencyPickerOpen(false);
                                  setCurrencySearch('');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-[var(--background-secondary)] flex items-center gap-2 transition-colors text-sm"
                              >
                                <span className="text-base w-5 text-center">{c.flag}</span>
                                <span className="font-medium">{c.code}</span>
                                <span className="text-[var(--foreground-muted)] text-xs flex-1">{c.name}</span>
                                {isHeld && (
                                  <span className="text-[10px] text-[var(--foreground-subtle)]">held</span>
                                )}
                              </button>
                            );
                          })}
                          <div className="border-t border-[var(--border)]" />
                          {/* Remaining currencies */}
                          {FIAT_CURRENCIES.filter((c) => !COMMON_CURRENCY_CODES.includes(c.code)).map((c) => {
                            const isHeld = heldCurrencies.has(c.code);
                            return (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCashCurrency(c.code);
                                  setIsCurrencyPickerOpen(false);
                                  setCurrencySearch('');
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-[var(--background-secondary)] flex items-center gap-2 transition-colors text-sm"
                              >
                                <span className="text-base w-5 text-center">{c.flag}</span>
                                <span className="font-medium">{c.code}</span>
                                <span className="text-[var(--foreground-muted)] text-xs flex-1">{c.name}</span>
                                {isHeld && (
                                  <span className="text-[10px] text-[var(--foreground-subtle)]">held</span>
                                )}
                              </button>
                            );
                          })}
                        </>
                      )}

                      {/* Filtered results */}
                      {currencySearch && filteredCurrencies.map((c) => {
                        const isHeld = heldCurrencies.has(c.code);
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCashCurrency(c.code);
                              setIsCurrencyPickerOpen(false);
                              setCurrencySearch('');
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-[var(--background-secondary)] flex items-center gap-2 transition-colors text-sm"
                          >
                            <span className="text-base w-5 text-center">{c.flag}</span>
                            <span className="font-medium">{c.code}</span>
                            <span className="text-[var(--foreground-muted)] text-xs flex-1">{c.name}</span>
                            {isHeld && (
                              <span className="text-[10px] text-[var(--foreground-subtle)]">held</span>
                            )}
                          </button>
                        );
                      })}

                      {currencySearch && filteredCurrencies.length === 0 && (
                        <p className="px-3 py-2 text-xs text-[var(--foreground-muted)]">No currencies match</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Balance input */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">Balance</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={cashBalance}
                  onChange={(e) => setCashBalance(e.target.value)}
                  className="form-input w-full"
                  required
                />
              </div>

              {/* Context banner for existing position */}
              {existingPosition && (
                <div className="px-3 py-2 bg-[var(--background-secondary)] text-[12px] text-[var(--foreground-muted)]">
                  Existing: {formatNumber(existingPosition.amount)} {cashCurrency} at{' '}
                  {manualAccounts.find((a) => a.id === selectedCashAccountId)?.name}. This will increase the existing balance.
                </div>
              )}
            </>
          ) : tab !== 'manual' ? (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                <input
                  type="text"
                  placeholder={`Search ${tab === 'crypto' ? 'cryptocurrencies' : equityType === 'etf' ? 'ETFs' : 'stocks'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input w-full pl-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--foreground-muted)]" />
                )}
              </div>

              {/* Search results */}
              {searchResults.length > 0 && !selectedAsset && (
                <div className="border border-[var(--border)]  max-h-48 overflow-y-auto">
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
                          className="w-6 h-6 "
                        />
                      )}
                      {tab === 'stock' && (
                        <StockIcon
                          symbol={result.symbol}
                          size={24}
                          isETF={equityType === 'etf'}
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
                <div className="p-3 bg-[var(--background-secondary)]  flex items-center gap-3">
                  {tab === 'crypto' && selectedAsset.image && (
                    <img
                      src={selectedAsset.image}
                      alt={selectedAsset.symbol}
                      className="w-8 h-8 "
                    />
                  )}
                  {tab === 'stock' && (
                    <StockIcon
                      symbol={selectedAsset.symbol}
                      size={32}
                      isETF={equityType === 'etf'}
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
                    className="p-1 hover:bg-[var(--border)] "
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual asset inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g., GOLD"
                    value={manualSymbol}
                    onChange={(e) => setManualSymbol(e.target.value)}
                    className="form-input w-full"
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
                    className="form-input w-full"
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
                  className="form-input w-full"
                  required
                />
              </div>
            </>
          )}

          {/* Amount, cost basis, and purchase date - not shown for cash */}
          {tab !== 'cash' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="form-input w-full"
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
                    className="form-input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Purchase date (optional)
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="form-input w-full"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </>
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
                  ? isCashSubmitDisabled
                  : tab === 'manual'
                  ? !manualSymbol || !manualName || !amount || !manualPrice
                  : !selectedAsset || !amount || (tab === 'stock' && brokerageAccounts.length > 1 && !selectedBrokerageId)
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
