'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Wallet, Plus } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { PerpExchange } from '@/types';
import { getSupportedPerpExchanges } from '@/services';

interface AddWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'single' | 'bulk';

interface ParsedWallet {
  name: string;
  address: string;
  isValid: boolean;
  error?: string;
}

export default function AddWalletModal({ isOpen, onClose }: AddWalletModalProps) {
  const [mode, setMode] = useState<Mode>('single');

  // Single mode state
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [selectedPerpExchanges, setSelectedPerpExchanges] = useState<PerpExchange[]>([]);

  // Bulk mode state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkPerpExchanges, setBulkPerpExchanges] = useState<PerpExchange[]>([]);

  const { addWallet, wallets } = usePortfolioStore();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAddress('');
      setName('');
      setSelectedPerpExchanges([]);
      setBulkInput('');
      setBulkPerpExchanges([]);
      setMode('single');
    }
  }, [isOpen]);

  // Toggle perp exchange selection
  const togglePerpExchange = (exchange: PerpExchange, isBulk: boolean = false) => {
    if (isBulk) {
      setBulkPerpExchanges(prev =>
        prev.includes(exchange)
          ? prev.filter(e => e !== exchange)
          : [...prev, exchange]
      );
    } else {
      setSelectedPerpExchanges(prev =>
        prev.includes(exchange)
          ? prev.filter(e => e !== exchange)
          : [...prev, exchange]
      );
    }
  };

  // Validate Ethereum address format
  const isValidAddress = (addr: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  // Check if address already exists
  const addressExists = (addr: string): boolean => {
    return wallets.some(w => w.address.toLowerCase() === addr.toLowerCase());
  };

  // Parse bulk input into wallet entries
  const parsedWallets = useMemo((): ParsedWallet[] => {
    if (!bulkInput.trim()) return [];

    const lines = bulkInput.split('\n').filter(line => line.trim());
    const existingInBatch = new Set<string>();

    return lines.map((line, index) => {
      const trimmed = line.trim();

      // Check for "name: address" or "name, address" format
      let walletName: string;
      let walletAddress: string;

      const colonMatch = trimmed.match(/^(.+?):\s*(0x[a-fA-F0-9]{40})$/);
      const commaMatch = trimmed.match(/^(.+?),\s*(0x[a-fA-F0-9]{40})$/);
      const addressOnlyMatch = trimmed.match(/^(0x[a-fA-F0-9]{40})$/);

      if (colonMatch) {
        walletName = colonMatch[1].trim();
        walletAddress = colonMatch[2]; // Preserve original case for API compatibility
      } else if (commaMatch) {
        walletName = commaMatch[1].trim();
        walletAddress = commaMatch[2]; // Preserve original case for API compatibility
      } else if (addressOnlyMatch) {
        walletName = `Wallet ${index + 1}`;
        walletAddress = addressOnlyMatch[1]; // Preserve original case for API compatibility
      } else {
        // Try to extract any address from the line
        const anyAddressMatch = trimmed.match(/(0x[a-fA-F0-9]{40})/);
        if (anyAddressMatch) {
          walletAddress = anyAddressMatch[1]; // Preserve original case for API compatibility
          const beforeAddress = trimmed.substring(0, trimmed.indexOf(anyAddressMatch[1])).trim();
          walletName = beforeAddress.replace(/[,:]$/, '').trim() || `Wallet ${index + 1}`;
        } else {
          return {
            name: `Line ${index + 1}`,
            address: trimmed,
            isValid: false,
            error: 'Invalid address format',
          };
        }
      }

      // Check for duplicates
      if (addressExists(walletAddress)) {
        return {
          name: walletName,
          address: walletAddress,
          isValid: false,
          error: 'Already added',
        };
      }

      if (existingInBatch.has(walletAddress)) {
        return {
          name: walletName,
          address: walletAddress,
          isValid: false,
          error: 'Duplicate in list',
        };
      }

      existingInBatch.add(walletAddress);

      return {
        name: walletName,
        address: walletAddress,
        isValid: true,
      };
    });
  }, [bulkInput, wallets]);

  const validWallets = parsedWallets.filter(w => w.isValid);
  const invalidWallets = parsedWallets.filter(w => !w.isValid);

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!address || !name) return;

    if (!isValidAddress(address)) {
      alert('Please enter a valid Ethereum address (0x...)');
      return;
    }

    if (addressExists(address)) {
      alert('This wallet address has already been added.');
      return;
    }

    addWallet({
      address, // Preserve original case for API compatibility (e.g., Lighter is case-sensitive)
      name,
      chains: [],
      perpExchanges: selectedPerpExchanges.length > 0 ? selectedPerpExchanges : undefined,
    });

    onClose();
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validWallets.length === 0) return;

    // Add all valid wallets with the same perp exchange settings
    validWallets.forEach(wallet => {
      addWallet({
        address: wallet.address,
        name: wallet.name,
        chains: [],
        perpExchanges: bulkPerpExchanges.length > 0 ? bulkPerpExchanges : undefined,
      });
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Wallet{mode === 'bulk' ? 's' : ''}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)]  transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 py-2 px-4  text-sm font-medium transition-colors ${
              mode === 'single'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Single Wallet
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`flex-1 py-2 px-4  text-sm font-medium transition-colors ${
              mode === 'bulk'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Bulk Add
          </button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4">
            {/* Wallet icon and info */}
            <div className="flex items-center gap-3 p-4 bg-[var(--background-secondary)] ">
              <div className="w-12 h-12 bg-[var(--accent-primary)]  flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-medium">Track wallet automatically</p>
                <p className="text-sm text-[var(--foreground-muted)]">
                  We&apos;ll fetch all token balances using DeBank
                </p>
              </div>
            </div>

            {/* Name input */}
            <div>
              <label className="block text-sm font-medium mb-1">Wallet Name</label>
              <input
                type="text"
                placeholder="e.g., Main Wallet, DeFi Wallet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input w-full"
                required
              />
            </div>

            {/* Address input */}
            <div>
              <label className="block text-sm font-medium mb-1">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full font-mono text-sm"
                required
              />
            </div>

            {/* Perp Exchanges */}
            <div>
              <label className="block text-sm font-medium mb-2">Perp Exchanges (optional)</label>
              <p className="text-xs text-[var(--foreground-muted)] mb-2">
                Select if this wallet has positions on perpetual futures exchanges
              </p>
              <div className="flex flex-wrap gap-2">
                {getSupportedPerpExchanges().map((exchange) => (
                  <button
                    key={exchange.id}
                    type="button"
                    onClick={() => togglePerpExchange(exchange.id)}
                    className={`px-3 py-1.5  text-sm font-medium transition-colors ${
                      selectedPerpExchanges.includes(exchange.id)
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {exchange.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit button */}
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={!address || !name}
              >
                Add Wallet
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4">
            {/* Bulk input instructions */}
            <div className="flex items-center gap-3 p-4 bg-[var(--background-secondary)] ">
              <div className="w-12 h-12 bg-[var(--accent-primary)]  flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-medium">Add multiple wallets at once</p>
                <p className="text-sm text-[var(--foreground-muted)]">
                  One address per line. Optional: &quot;Name: 0x...&quot;
                </p>
              </div>
            </div>

            {/* Bulk textarea */}
            <div>
              <label className="block text-sm font-medium mb-1">Wallet Addresses</label>
              <textarea
                placeholder={`Paste addresses, one per line:\n\nMain Wallet: 0x1234...abcd\nDeFi Wallet: 0x5678...efgh\n0x9abc...1234`}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="w-full font-mono text-sm h-32 resize-none"
                required
              />
            </div>

            {/* Perp Exchanges for bulk */}
            <div>
              <label className="block text-sm font-medium mb-2">Perp Exchanges (optional)</label>
              <p className="text-xs text-[var(--foreground-muted)] mb-2">
                Apply to all wallets being added
              </p>
              <div className="flex flex-wrap gap-2">
                {getSupportedPerpExchanges().map((exchange) => (
                  <button
                    key={exchange.id}
                    type="button"
                    onClick={() => togglePerpExchange(exchange.id, true)}
                    className={`px-3 py-1.5  text-sm font-medium transition-colors ${
                      bulkPerpExchanges.includes(exchange.id)
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {exchange.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview of parsed wallets */}
            {parsedWallets.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Preview ({validWallets.length} valid, {invalidWallets.length} invalid)
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-[var(--background-secondary)] ">
                  {parsedWallets.map((wallet, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between text-sm p-2  ${
                        wallet.isValid
                          ? 'bg-[var(--positive-light)]'
                          : 'bg-[var(--negative-light)]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{wallet.name}</span>
                        <span className="text-[var(--foreground-muted)] ml-2 font-mono text-xs">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </span>
                      </div>
                      {wallet.error && (
                        <span className="text-xs text-[var(--negative)] ml-2">
                          {wallet.error}
                        </span>
                      )}
                    </div>
                  ))}
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
                disabled={validWallets.length === 0}
              >
                Add {validWallets.length} Wallet{validWallets.length !== 1 ? 's' : ''}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
