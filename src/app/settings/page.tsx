'use client';

import { useState, useEffect } from 'react';
import { Save, Key, RefreshCw, Trash2, Download, Upload, Fingerprint, LogOut, Shield, Sun, Moon, Monitor, TrendingUp, Bot, Loader2, CheckCircle, XCircle, HardDrive } from 'lucide-react';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, applyTheme } from '@/store/themeStore';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  registerPasskey,
  removePasskey,
} from '@/lib/passkey';

export default function SettingsPage() {
  const [debankApiKey, setDebankApiKey] = useState('');
  const [heliusApiKey, setHeliusApiKey] = useState('');
  const [birdeyeApiKey, setBirdeyeApiKey] = useState('');
  const [stockApiKey, setStockApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState(0);
  const [restoring, setRestoring] = useState(false);

  const { positions, accounts, snapshots, riskFreeRate, setRiskFreeRate } = usePortfolioStore();
  const { logout, setPasskeyEnabled } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // Load saved API keys and check passkey status
  useEffect(() => {
    setDebankApiKey(localStorage.getItem('debank_api_key') || '');
    setHeliusApiKey(localStorage.getItem('helius_api_key') || '');
    setBirdeyeApiKey(localStorage.getItem('birdeye_api_key') || '');
    setStockApiKey(localStorage.getItem('stock_api_key') || '');
    setOllamaUrl(localStorage.getItem('ollama_url') || 'http://localhost:11434');
    setOllamaModel(localStorage.getItem('ollama_model') || 'llama3.2');

    // Check passkey support and status
    setPasskeySupported(isPasskeySupported());
    setHasPasskey(isPasskeyRegistered());

    // Fetch backup status
    fetch('/api/backup')
      .then(res => res.json())
      .then(data => {
        if (data.backups && data.backups.length > 0) {
          const current = data.backups.find((b: { name: string }) => b.name === 'current.json');
          if (current) {
            setLastBackup(current.modified);
          }
          setBackupCount(data.backups.filter((b: { name: string }) => b.name.startsWith('backup-')).length);
        }
      })
      .catch(() => { /* backup endpoint may not be available */ });
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

  const handleTestOllama = async () => {
    setOllamaStatus('testing');
    setOllamaError(null);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];
      const hasModel = models.some((m: string) => m.startsWith(ollamaModel));
      if (hasModel) {
        setOllamaStatus('connected');
      } else {
        setOllamaStatus('error');
        setOllamaError(
          `Connected but model "${ollamaModel}" not found. Available: ${models.join(', ') || 'none'}. Run: ollama pull ${ollamaModel}`
        );
      }
    } catch {
      setOllamaStatus('error');
      setOllamaError('Cannot connect to Ollama. Make sure it is running (ollama serve).');
    }
  };

  const handleSave = () => {
    localStorage.setItem('debank_api_key', debankApiKey);
    localStorage.setItem('helius_api_key', heliusApiKey);
    localStorage.setItem('birdeye_api_key', birdeyeApiKey);
    localStorage.setItem('stock_api_key', stockApiKey);
    if (ollamaUrl && ollamaUrl !== 'http://localhost:11434') {
      localStorage.setItem('ollama_url', ollamaUrl);
    } else {
      localStorage.removeItem('ollama_url');
    }
    if (ollamaModel && ollamaModel !== 'llama3.2') {
      localStorage.setItem('ollama_model', ollamaModel);
    } else {
      localStorage.removeItem('ollama_model');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const data = {
      positions,
      accounts,
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
        // Support both old format (wallets) and new format (accounts)
        const importAccounts = data.accounts || data.wallets || [];
        if (data.positions) {
          // Clear existing data and import
          localStorage.setItem('portfolio-storage', JSON.stringify({
            state: {
              positions: data.positions,
              accounts: importAccounts,
              snapshots: data.snapshots || [],
              prices: {},
              lastRefresh: null,
              isRefreshing: false,
            },
            version: 10,
          }));
          window.location.reload();
        }
      } catch (error) {
        alert('Failed to import data. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreFromBackup = async () => {
    if (!confirm('This will replace all current data with the latest server backup. Continue?')) return;
    setRestoring(true);
    try {
      const res = await fetch('/api/backup?file=current.json');
      if (!res.ok) throw new Error('No backup found');
      const data = await res.json();
      localStorage.setItem('portfolio-storage', JSON.stringify({
        state: {
          positions: data.positions || [],
          accounts: data.accounts || [],
          prices: data.prices || {},
          customPrices: data.customPrices || {},
          transactions: data.transactions || [],
          snapshots: data.snapshots || [],
          lastRefresh: data.lastRefresh || null,
          isRefreshing: false,
          hideBalances: data.hideBalances ?? false,
          hideDust: data.hideDust ?? false,
          riskFreeRate: data.riskFreeRate ?? 0.05,
        },
        version: data.storeVersion || 10,
      }));
      window.location.reload();
    } catch {
      alert('Failed to restore from backup. No backup file found on server.');
    } finally {
      setRestoring(false);
    }
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all portfolio data? This cannot be undone.')) {
      localStorage.removeItem('portfolio-storage');
      window.location.reload();
    }
  };

  return (
    <div>
      <div className="max-w-2xl space-y-6">
        {/* Security */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Protect your portfolio with a passkey (Face ID, Touch ID, or device PIN).
          </p>

          {!passkeySupported ? (
            <div className="p-3 bg-[var(--background-secondary)]  text-[13px] text-[var(--foreground-muted)]">
              Passkeys are not supported in this browser.
            </div>
          ) : hasPasskey ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-[var(--positive-light)] ">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-[var(--positive)]" />
                  <span className="text-[13px] font-medium text-[var(--positive)]">Passkey enabled</span>
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
                <div className="p-3 bg-[var(--negative-light)]  text-[var(--negative)] text-[13px]">
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
                    <span className="w-4 h-4 border-2 border-white border-t-transparent  animate-spin" />
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

        <hr className="border-[var(--border)]" />

        {/* Appearance */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <Sun className="w-5 h-5" />
            Appearance
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Choose your preferred color theme.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleThemeChange('light')}
              className={`p-4 border-2 transition-all ${
                theme === 'light'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)]'
                  : 'border-[var(--border)] hover:border-[var(--border-light)]'
              }`}
            >
              <Sun className={`w-6 h-6 mx-auto mb-2 ${theme === 'light' ? 'text-[var(--accent-primary)]' : ''}`} />
              <span className="text-sm font-medium">Light</span>
            </button>

            <button
              onClick={() => handleThemeChange('dark')}
              className={`p-4 border-2 transition-all ${
                theme === 'dark'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)]'
                  : 'border-[var(--border)] hover:border-[var(--border-light)]'
              }`}
            >
              <Moon className={`w-6 h-6 mx-auto mb-2 ${theme === 'dark' ? 'text-[var(--accent-primary)]' : ''}`} />
              <span className="text-sm font-medium">Dark</span>
            </button>

            <button
              onClick={() => handleThemeChange('system')}
              className={`p-4 border-2 transition-all ${
                theme === 'system'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-glow)]'
                  : 'border-[var(--border)] hover:border-[var(--border-light)]'
              }`}
            >
              <Monitor className={`w-6 h-6 mx-auto mb-2 ${theme === 'system' ? 'text-[var(--accent-primary)]' : ''}`} />
              <span className="text-sm font-medium">System</span>
            </button>
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* Performance Metrics */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Performance Metrics
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Configure parameters used in performance calculations.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium mb-1">
                Risk-Free Rate (for Sharpe Ratio)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={(riskFreeRate * 100).toFixed(1)}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value >= 0 && value <= 20) {
                      setRiskFreeRate(value / 100);
                    }
                  }}
                  className="w-24"
                />
                <span className="text-[13px] text-[var(--foreground-muted)]">%</span>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Annual risk-free rate used to calculate Sharpe ratio. Default is 5% (approximate US Treasury rate).
              </p>
            </div>
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* Ollama (NL Input) */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Natural Language Input (Ollama)
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-2">
            Configure a local Ollama instance to parse natural language commands like &quot;Sold 50% of GOOG today&quot;.
          </p>
          <p className="text-[11px] text-[var(--foreground-muted)] mb-4">
            All data stays on your machine — no API keys needed
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ollama URL</label>
              <input
                type="text"
                placeholder="http://localhost:11434"
                value={ollamaUrl}
                onChange={(e) => {
                  setOllamaUrl(e.target.value);
                  setOllamaStatus('idle');
                }}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Base URL for your local Ollama instance
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <input
                type="text"
                placeholder="llama3.2"
                value={ollamaModel}
                onChange={(e) => {
                  setOllamaModel(e.target.value);
                  setOllamaStatus('idle');
                }}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Ollama model to use for parsing. Default: llama3.2
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestOllama}
                disabled={ollamaStatus === 'testing'}
                className="btn btn-secondary"
              >
                {ollamaStatus === 'testing' ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing...
                  </span>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Test Connection
                  </>
                )}
              </button>
            </div>

            {ollamaStatus === 'connected' && (
              <div className="p-3 bg-[var(--positive-light)] border border-[rgba(124,185,139,0.2)] flex items-center gap-1.5 text-[13px] text-[var(--positive)]">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Connected — {ollamaModel} available
              </div>
            )}

            {ollamaStatus === 'error' && ollamaError && (
              <div className="p-3 bg-[var(--negative-light)] border border-[rgba(201,123,123,0.2)] text-[var(--negative)] text-[13px]">
                {ollamaError}
              </div>
            )}
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* API Keys */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Add your API keys to enable real-time data fetching. Without API keys, the app uses demo/simulated data.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                DeBank API Key (EVM Chains)
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
                Used for Ethereum, Arbitrum, Base, and other EVM chains
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Helius API Key (Solana - Primary)
                <a
                  href="https://dev.helius.xyz/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[var(--accent-primary)] text-xs"
                >
                  Get API key
                </a>
              </label>
              <input
                type="password"
                placeholder="Enter your Helius API key"
                value={heliusApiKey}
                onChange={(e) => setHeliusApiKey(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Primary provider for Solana tokens using DAS API
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Birdeye API Key (Solana - Fallback)
                <a
                  href="https://docs.birdeye.so/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[var(--accent-primary)] text-xs"
                >
                  Get API key
                </a>
              </label>
              <input
                type="password"
                placeholder="Enter your Birdeye API key (optional)"
                value={birdeyeApiKey}
                onChange={(e) => setBirdeyeApiKey(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Alternative provider with better token coverage (used as fallback)
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

        <hr className="border-[var(--border)]" />

        {/* Auto-refresh settings */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Auto-Refresh
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Portfolio data is automatically refreshed once per day.
          </p>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[var(--positive)]  animate-pulse"></div>
            <span className="text-[13px]">Auto-refresh enabled (daily)</span>
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* Daily Snapshots */}
        <div>
          <h3 className="text-[15px] font-medium mb-4">Daily Snapshots</h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            A snapshot of your portfolio value is taken once per day to track historical performance.
          </p>
          <div className="flex items-center justify-between p-3 bg-[var(--background-secondary)] ">
            <span className="text-[13px]">Total snapshots recorded</span>
            <span className="font-semibold">{snapshots.length}</span>
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* Data Management */}
        <div>
          <h3 className="text-[15px] font-medium mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Data Management
          </h3>
          <p className="text-[13px] text-[var(--foreground-muted)] mb-4">
            Your portfolio is automatically backed up to the server every time data changes. Export, import, or restore from the latest backup.
          </p>

          {lastBackup && (
            <div className="flex items-center justify-between p-3 bg-[var(--background-secondary)] mb-4">
              <div>
                <span className="text-[13px]">Last auto-backup</span>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {new Date(lastBackup).toLocaleString()} &middot; {backupCount} daily backup{backupCount !== 1 ? 's' : ''} saved
                </p>
              </div>
              <div className="w-2 h-2 bg-[var(--positive)] animate-pulse"></div>
            </div>
          )}

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

            <button
              onClick={handleRestoreFromBackup}
              disabled={restoring || !lastBackup}
              className="btn btn-secondary"
            >
              <RefreshCw className={`w-4 h-4 ${restoring ? 'animate-spin' : ''}`} />
              {restoring ? 'Restoring...' : 'Restore from Backup'}
            </button>

            <button onClick={handleClearData} className="btn btn-danger">
              <Trash2 className="w-4 h-4" />
              Clear All Data
            </button>
          </div>
        </div>

        <hr className="border-[var(--border)]" />

        {/* About */}
        <div>
          <h3 className="text-[15px] font-medium mb-4">About</h3>
          <div className="space-y-2 text-[13px] text-[var(--foreground-muted)]">
            <p>
              <strong>Portfolio Tracker</strong> - Track your investments across crypto and equities.
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
