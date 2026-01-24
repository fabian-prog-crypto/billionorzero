'use client';

import { useState, useEffect } from 'react';
import { Save, Key, RefreshCw, Trash2, Download, Upload, Fingerprint, LogOut, Shield } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useAuthStore } from '@/store/authStore';
import Header from '@/components/Header';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  registerPasskey,
  removePasskey,
} from '@/lib/passkey';

export default function SettingsPage() {
  const [debankApiKey, setDebankApiKey] = useState('');
  const [stockApiKey, setStockApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const { positions, wallets, snapshots } = usePortfolioStore();
  const { logout, setPasskeyEnabled } = useAuthStore();

  // Load saved API keys and check passkey status
  useEffect(() => {
    setDebankApiKey(localStorage.getItem('debank_api_key') || '');
    setStockApiKey(localStorage.getItem('stock_api_key') || '');

    // Check passkey support and status
    setPasskeySupported(isPasskeySupported());
    setHasPasskey(isPasskeyRegistered());
  }, []);

  const handleSetupPasskey = async () => {
    setPasskeyLoading(true);
    setPasskeyError(null);

    const result = await registerPasskey();

    if (result.success) {
      setHasPasskey(true);
      setPasskeyEnabled(true);
    } else {
      setPasskeyError(result.error || 'Failed to set up passkey');
    }

    setPasskeyLoading(false);
  };

  const handleRemovePasskey = () => {
    if (confirm('Are you sure you want to remove your passkey? You will no longer need to authenticate to access your portfolio.')) {
      removePasskey();
      setHasPasskey(false);
      setPasskeyEnabled(false);
    }
  };

  const handleLock = () => {
    logout();
  };

  const handleSave = () => {
    localStorage.setItem('debank_api_key', debankApiKey);
    localStorage.setItem('stock_api_key', stockApiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const data = {
      positions,
      wallets,
      snapshots,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.positions && data.wallets) {
          // Clear existing data and import
          localStorage.setItem('portfolio-storage', JSON.stringify({
            state: {
              positions: data.positions,
              wallets: data.wallets,
              snapshots: data.snapshots || [],
              prices: {},
              lastRefresh: null,
              isRefreshing: false,
            },
            version: 0,
          }));
          window.location.reload();
        }
      } catch (error) {
        alert('Failed to import data. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all portfolio data? This cannot be undone.')) {
      localStorage.removeItem('portfolio-storage');
      window.location.reload();
    }
  };

  return (
    <div>
      <Header title="Settings" />

      <div className="max-w-2xl space-y-6">
        {/* Security */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Protect your portfolio with a passkey (Face ID, Touch ID, or device PIN).
          </p>

          {!passkeySupported ? (
            <div className="p-3 bg-[var(--background-secondary)] rounded-lg text-sm text-[var(--foreground-muted)]">
              Passkeys are not supported in this browser.
            </div>
          ) : hasPasskey ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-[var(--positive-light)] rounded-lg">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-[var(--positive)]" />
                  <span className="text-sm font-medium text-[var(--positive)]">Passkey enabled</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleLock} className="btn btn-secondary">
                  <LogOut className="w-4 h-4" />
                  Lock Now
                </button>
                <button onClick={handleRemovePasskey} className="btn btn-danger">
                  <Trash2 className="w-4 h-4" />
                  Remove Passkey
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {passkeyError && (
                <div className="p-3 bg-[var(--negative-light)] text-[var(--negative)] rounded-lg text-sm">
                  {passkeyError}
                </div>
              )}

              <button
                onClick={handleSetupPasskey}
                disabled={passkeyLoading}
                className="btn btn-primary"
              >
                {passkeyLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting up...
                  </span>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    Set Up Passkey
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* API Keys */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Add your API keys to enable real-time data fetching. Without API keys, the app uses demo/simulated data.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                DeBank API Key
                <a
                  href="https://cloud.debank.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[var(--accent-primary)] text-xs"
                >
                  Get API key
                </a>
              </label>
              <input
                type="password"
                placeholder="Enter your DeBank API key"
                value={debankApiKey}
                onChange={(e) => setDebankApiKey(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Used for automatic wallet tracking and DeFi position detection
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Finnhub API Key (Stocks)
                <a
                  href="https://finnhub.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[var(--accent-primary)] text-xs"
                >
                  Get API key
                </a>
              </label>
              <input
                type="password"
                placeholder="Enter your Finnhub API key"
                value={stockApiKey}
                onChange={(e) => setStockApiKey(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Used for real-time stock and ETF price data
              </p>
            </div>

            <button
              onClick={handleSave}
              className="btn btn-primary"
            >
              <Save className="w-4 h-4" />
              {saved ? 'Saved!' : 'Save API Keys'}
            </button>
          </div>
        </div>

        {/* Auto-refresh settings */}
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Auto-Refresh
          </h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Portfolio data is automatically refreshed once per day.
          </p>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[var(--positive)] rounded-full animate-pulse"></div>
            <span className="text-sm">Auto-refresh enabled (daily)</span>
          </div>
        </div>

        {/* Daily Snapshots */}
        <div className="card">
          <h3 className="font-semibold mb-4">Daily Snapshots</h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            A snapshot of your portfolio value is taken once per day to track historical performance.
          </p>
          <div className="flex items-center justify-between p-3 bg-[var(--background-secondary)] rounded-lg">
            <span className="text-sm">Total snapshots recorded</span>
            <span className="font-semibold">{snapshots.length}</span>
          </div>
        </div>

        {/* Data Management */}
        <div className="card">
          <h3 className="font-semibold mb-4">Data Management</h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Export your portfolio data for backup or import a previous backup.
          </p>

          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExport} className="btn btn-secondary">
              <Download className="w-4 h-4" />
              Export Data
            </button>

            <label className="btn btn-secondary cursor-pointer">
              <Upload className="w-4 h-4" />
              Import Data
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>

            <button onClick={handleClearData} className="btn btn-danger">
              <Trash2 className="w-4 h-4" />
              Clear All Data
            </button>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h3 className="font-semibold mb-4">About</h3>
          <div className="space-y-2 text-sm text-[var(--foreground-muted)]">
            <p>
              <strong>Portfolio Tracker</strong> - Track your investments across crypto and stocks.
            </p>
            <p>
              Crypto prices powered by <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)]">CoinGecko</a>
            </p>
            <p>
              Wallet tracking powered by <a href="https://debank.com/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)]">DeBank</a>
            </p>
            <p>
              Stock prices powered by <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)]">Finnhub</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
