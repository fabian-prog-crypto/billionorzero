'use client';

import { useState, useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { SUPPORTED_CHAINS } from '@/services';

interface AddWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddWalletModal({ isOpen, onClose }: AddWalletModalProps) {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [selectedChains, setSelectedChains] = useState<string[]>(['eth']);

  const { addWallet } = usePortfolioStore();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAddress('');
      setName('');
      setSelectedChains(['eth']);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!address || !name) return;

    // Validate Ethereum address format
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isValidAddress) {
      alert('Please enter a valid Ethereum address (0x...)');
      return;
    }

    addWallet({
      address: address.toLowerCase(),
      name,
      chains: selectedChains,
    });

    onClose();
  };

  const toggleChain = (chainId: string) => {
    setSelectedChains((prev) =>
      prev.includes(chainId)
        ? prev.filter((c) => c !== chainId)
        : [...prev, chainId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Add Wallet</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--background-secondary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Wallet icon and info */}
          <div className="flex items-center gap-3 p-4 bg-[var(--background-secondary)] rounded-lg">
            <div className="w-12 h-12 bg-[var(--accent-primary)] rounded-full flex items-center justify-center">
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
              className="w-full"
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

          {/* Chain selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Networks</label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => toggleChain(chain.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedChains.includes(chain.id)
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--tag-bg)] text-[var(--tag-text)] hover:bg-[var(--border)]'
                  }`}
                >
                  {chain.name}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="p-3 bg-[var(--positive-light)] rounded-lg text-sm text-[var(--positive)]">
            <p>
              <strong>Note:</strong> For demo purposes, wallet tracking uses simulated
              data. Connect your DeBank API key in Settings for real data.
            </p>
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
      </div>
    </div>
  );
}
