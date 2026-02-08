import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Position, Wallet, PriceData, NetWorthSnapshot, CexAccount, BrokerageAccount, CashAccount, Transaction } from '@/types';
import { toSlug, extractCashAccountName, linkOrphanedCashPositions } from '@/services/domain/cash-account-service';

// Custom price entry
export interface CustomPrice {
  price: number;
  note?: string;         // Optional note explaining why custom price is used
  setAt: string;         // ISO timestamp when set
}

interface PortfolioState {
  // Data
  positions: Position[];
  wallets: Wallet[];
  accounts: CexAccount[];
  brokerageAccounts: BrokerageAccount[];
  cashAccounts: CashAccount[];
  prices: Record<string, PriceData>;
  customPrices: Record<string, CustomPrice>;  // Symbol -> custom price override
  fxRates: Record<string, number>;  // Currency -> USD rate (e.g., CHF -> 1.12)
  transactions: Transaction[];
  snapshots: NetWorthSnapshot[];
  lastRefresh: string | null;
  isRefreshing: boolean;
  hideBalances: boolean;
  hideDust: boolean;  // Hide positions under $100 (except significant debt)

  // Settings
  riskFreeRate: number;  // Annual risk-free rate for Sharpe ratio (e.g., 0.05 = 5%)

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'> & { id?: string }) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;

  // Wallet actions
  addWallet: (wallet: Omit<Wallet, 'id' | 'addedAt'>) => void;
  removeWallet: (id: string) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;

  // CEX Account actions
  addAccount: (account: Omit<CexAccount, 'id' | 'addedAt'>) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<CexAccount>) => void;

  // Brokerage Account actions
  addBrokerageAccount: (account: Omit<BrokerageAccount, 'id' | 'addedAt'>) => void;
  removeBrokerageAccount: (id: string) => void;
  updateBrokerageAccount: (id: string, updates: Partial<BrokerageAccount>) => void;

  // Cash Account actions
  addCashAccount: (account: Omit<CashAccount, 'id' | 'slug' | 'addedAt'>) => string;
  removeCashAccount: (id: string) => void;
  updateCashAccount: (id: string, updates: Partial<CashAccount>) => void;

  // Wallet positions - replaces all positions from wallets
  setWalletPositions: (walletPositions: Position[]) => void;

  // Account positions - replaces all positions from CEX accounts
  setAccountPositions: (accountPositions: Position[]) => void;

  // Price actions
  setPrices: (prices: Record<string, PriceData>) => void;
  updatePrice: (symbol: string, price: PriceData) => void;

  // FX rate actions
  setFxRates: (rates: Record<string, number>) => void;

  // Custom price actions
  setCustomPrice: (symbol: string, price: number, note?: string) => void;
  removeCustomPrice: (symbol: string) => void;

  // Transaction actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  getTransactionsBySymbol: (symbol: string) => Transaction[];
  getTransactionsByPosition: (positionId: string) => Transaction[];

  // Snapshot actions
  addSnapshot: (snapshot: Omit<NetWorthSnapshot, 'id'>) => void;

  // Refresh state
  setRefreshing: (isRefreshing: boolean) => void;
  setLastRefresh: (timestamp: string) => void;

  // UI state
  toggleHideBalances: () => void;
  toggleHideDust: () => void;

  // Settings
  setRiskFreeRate: (rate: number) => void;

  // Clear all data
  clearAll: () => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      positions: [],
      wallets: [],
      accounts: [],
      brokerageAccounts: [],
      cashAccounts: [],
      prices: {},
      customPrices: {},
      fxRates: {},
      transactions: [],
      snapshots: [],
      lastRefresh: null,
      isRefreshing: false,
      hideBalances: false,
      hideDust: false,  // Default: show all positions
      riskFreeRate: 0.05,  // Default 5% (US Treasury rate)

      // Add a manual position
      addPosition: (position) => {
        const now = new Date().toISOString();
        set((state) => ({
          positions: [
            ...state.positions,
            {
              ...position,
              id: position.id || uuidv4(),
              addedAt: now,
              updatedAt: now,
            },
          ],
        }));
      },

      // Remove a position by ID
      removePosition: (id) => {
        set((state) => ({
          positions: state.positions.filter((p) => p.id !== id),
        }));
      },

      // Update a position
      updatePosition: (id, updates) => {
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      // Add a wallet to track
      addWallet: (wallet) => {
        set((state) => ({
          wallets: [
            ...state.wallets,
            {
              ...wallet,
              id: uuidv4(),
              addedAt: new Date().toISOString(),
            },
          ],
        }));
      },

      // Remove a wallet and its positions
      removeWallet: (id) => {
        const wallet = get().wallets.find((w) => w.id === id);
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
          // Also remove all positions from this wallet
          positions: wallet
            ? state.positions.filter((p) => p.walletAddress !== wallet.address)
            : state.positions,
        }));
      },

      // Update wallet details
      updateWallet: (id, updates) => {
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        }));
      },

      // Add a CEX account
      addAccount: (account) => {
        set((state) => ({
          accounts: [
            ...state.accounts,
            {
              ...account,
              id: uuidv4(),
              addedAt: new Date().toISOString(),
            },
          ],
        }));
      },

      // Remove a CEX account and its positions
      removeAccount: (id) => {
        const account = get().accounts.find((a) => a.id === id);
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          // Also remove all positions from this account
          positions: account
            ? state.positions.filter((p) => p.protocol !== `cex:${account.exchange}:${account.id}`)
            : state.positions,
        }));
      },

      // Update CEX account details
      updateAccount: (id, updates) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        }));
      },

      // Add a brokerage account
      addBrokerageAccount: (account) => {
        set((state) => ({
          brokerageAccounts: [
            ...state.brokerageAccounts,
            {
              ...account,
              id: uuidv4(),
              addedAt: new Date().toISOString(),
            },
          ],
        }));
      },

      // Remove a brokerage account and its positions
      removeBrokerageAccount: (id) => {
        set((state) => ({
          brokerageAccounts: state.brokerageAccounts.filter((a) => a.id !== id),
          positions: state.positions.filter((p) => p.protocol !== `brokerage:${id}`),
        }));
      },

      // Update brokerage account details
      updateBrokerageAccount: (id, updates) => {
        set((state) => ({
          brokerageAccounts: state.brokerageAccounts.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        }));
      },

      // Add a cash account (auto-generates slug; rejects duplicate slugs)
      addCashAccount: (account) => {
        const slug = toSlug(account.name);
        const existing = get().cashAccounts.find((a) => a.slug === slug);
        if (existing) return existing.id; // Merge: return existing account's ID
        const id = uuidv4();
        set((state) => ({
          cashAccounts: [
            ...state.cashAccounts,
            {
              ...account,
              id,
              slug,
              addedAt: new Date().toISOString(),
            },
          ],
        }));
        return id;
      },

      // Remove a cash account and its positions
      removeCashAccount: (id) => {
        set((state) => ({
          cashAccounts: state.cashAccounts.filter((a) => a.id !== id),
          positions: state.positions.filter((p) => p.protocol !== `cash-account:${id}`),
        }));
      },

      // Update cash account details (name only — slug is immutable)
      updateCashAccount: (id, updates) => {
        set((state) => ({
          cashAccounts: state.cashAccounts.map((a) => {
            if (a.id !== id) return a;
            // Never allow slug to be changed via updates
            const { slug: _ignored, ...safeUpdates } = updates as Record<string, unknown>;
            return { ...a, ...safeUpdates };
          }),
        }));
      },

      // Replace all wallet positions (keeps manual and CEX positions intact)
      setWalletPositions: (walletPositions) => {
        set((state) => {
          // Keep manual positions and CEX positions (those with protocol starting with 'cex:')
          const manualAndCexPositions = state.positions.filter(
            (p) => !p.walletAddress || p.protocol?.startsWith('cex:')
          );
          // Combine with new wallet positions
          return {
            positions: [...manualAndCexPositions, ...walletPositions],
          };
        });
      },

      // Replace all CEX account positions (keeps manual and wallet positions intact)
      setAccountPositions: (accountPositions) => {
        set((state) => {
          // Keep positions that are not from CEX accounts
          const nonCexPositions = state.positions.filter(
            (p) => !p.protocol?.startsWith('cex:')
          );
          // Combine with new account positions
          return {
            positions: [...nonCexPositions, ...accountPositions],
          };
        });
      },

      // Set all prices
      setPrices: (prices) => {
        set({ prices });
      },

      // Set FX rates
      setFxRates: (fxRates) => {
        set({ fxRates });
      },

      // Update a single price
      updatePrice: (symbol, price) => {
        set((state) => ({
          prices: { ...state.prices, [symbol.toLowerCase()]: price },
        }));
      },

      // Set a custom price override for a symbol
      setCustomPrice: (symbol, price, note) => {
        set((state) => ({
          customPrices: {
            ...state.customPrices,
            [symbol.toLowerCase()]: {
              price,
              note,
              setAt: new Date().toISOString(),
            },
          },
        }));
      },

      // Remove a custom price override
      removeCustomPrice: (symbol) => {
        set((state) => {
          const { [symbol.toLowerCase()]: _, ...rest } = state.customPrices;
          return { customPrices: rest };
        });
      },

      // Add a transaction record
      addTransaction: (tx) => {
        set((state) => ({
          transactions: [
            ...state.transactions,
            {
              ...tx,
              id: uuidv4(),
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      },

      // Get transactions by symbol
      getTransactionsBySymbol: (symbol) => {
        return get().transactions.filter(
          (t) => t.symbol.toLowerCase() === symbol.toLowerCase()
        );
      },

      // Get transactions by position ID
      getTransactionsByPosition: (positionId) => {
        return get().transactions.filter((t) => t.positionId === positionId);
      },

      // Add a daily snapshot
      addSnapshot: (snapshot) => {
        set((state) => ({
          snapshots: [
            ...state.snapshots,
            { ...snapshot, id: uuidv4() },
          ],
        }));
      },

      // Set refreshing state
      setRefreshing: (isRefreshing) => {
        set({ isRefreshing });
      },

      // Set last refresh timestamp
      setLastRefresh: (timestamp) => {
        set({ lastRefresh: timestamp });
      },

      // Toggle hide balances
      toggleHideBalances: () => {
        set((state) => ({ hideBalances: !state.hideBalances }));
      },

      toggleHideDust: () => {
        set((state) => ({ hideDust: !state.hideDust }));
      },

      // Settings
      setRiskFreeRate: (rate) => {
        set({ riskFreeRate: rate });
      },

      // Clear all data
      clearAll: () => {
        set({
          positions: [],
          wallets: [],
          accounts: [],
          brokerageAccounts: [],
          cashAccounts: [],
          prices: {},
          customPrices: {},
          transactions: [],
          snapshots: [],
          lastRefresh: null,
          isRefreshing: false,
        });
      },
    }),
    {
      name: 'portfolio-storage',
      version: 7,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        // v2 → v3: add transactions array
        if (version < 3) {
          state.transactions = state.transactions || [];
        }
        // v3 → v4: add brokerageAccounts, tag existing equities
        if (version < 4) {
          state.brokerageAccounts = state.brokerageAccounts || [];
          const positions = (state.positions || []) as Array<Record<string, unknown>>;
          const equityPositions = positions.filter(
            (p) => (p.type === 'stock' || p.type === 'etf') && !p.protocol
          );
          if (equityPositions.length > 0) {
            const accountId = uuidv4();
            (state.brokerageAccounts as Array<Record<string, unknown>>).push({
              id: accountId,
              name: 'Revolut',
              isActive: true,
              addedAt: new Date().toISOString(),
            });
            equityPositions.forEach((p) => {
              p.protocol = `brokerage:${accountId}`;
            });
          }
        }
        // v4 → v5: add cashAccounts, tag existing cash positions
        if (version < 5) {
          state.cashAccounts = state.cashAccounts || [];
          const positions = (state.positions || []) as Array<Record<string, unknown>>;
          const cashPositions = positions.filter(
            (p) => p.type === 'cash' && !String(p.protocol || '').startsWith('cash-account:')
          );
          const accountNames = new Map<string, string>();
          cashPositions.forEach((p) => {
            const match = String(p.name || '').match(/^(.+?)\s*\(/);
            const accountName = (match ? match[1].trim() : String(p.name || '')) || 'Manual';
            if (!accountNames.has(accountName)) {
              const accountId = uuidv4();
              accountNames.set(accountName, accountId);
              (state.cashAccounts as Array<Record<string, unknown>>).push({
                id: accountId,
                name: accountName,
                isActive: true,
                addedAt: new Date().toISOString(),
              });
            }
            p.protocol = `cash-account:${accountNames.get(accountName)}`;
          });
        }
        // v5 → v6: ensure cashAccounts array exists (linking handled by onRehydrateStorage)
        if (version < 6) {
          state.cashAccounts = state.cashAccounts || [];
        }
        // v6 → v7: rebuild CashAccounts from positions with slug-based matching
        if (version < 7) {
          // Wipe existing cashAccounts (may be corrupted from prior migrations)
          state.cashAccounts = [];
          const positions = (state.positions || []) as Array<Record<string, unknown>>;
          const cashPositions = positions.filter((p) => p.type === 'cash');
          const slugToAccount = new Map<string, Record<string, unknown>>();

          cashPositions.forEach((p) => {
            const accountName = extractCashAccountName(String(p.name || ''));
            const slug = toSlug(accountName);

            if (!slugToAccount.has(slug)) {
              const accountId = uuidv4();
              const account = {
                id: accountId,
                slug,
                name: accountName,
                isActive: true,
                addedAt: new Date().toISOString(),
              };
              slugToAccount.set(slug, account);
              (state.cashAccounts as Array<Record<string, unknown>>).push(account);
            }

            // Set protocol on position to point to the account
            const account = slugToAccount.get(slug)!;
            p.protocol = `cash-account:${account.id}`;
          });
        }
        return state as unknown as PortfolioState;
      },
      onRehydrateStorage: () => {
        return () => {
          const state = usePortfolioStore.getState();
          const result = linkOrphanedCashPositions(state.positions, state.cashAccounts);
          if (result) {
            usePortfolioStore.setState(result);
          }
        };
      },
      // Don't persist volatile UI state - this prevents sync from getting stuck
      partialize: (state) => ({
        positions: state.positions,
        wallets: state.wallets,
        accounts: state.accounts,
        brokerageAccounts: state.brokerageAccounts,
        cashAccounts: state.cashAccounts,
        prices: state.prices,
        customPrices: state.customPrices,
        transactions: state.transactions,
        snapshots: state.snapshots,
        lastRefresh: state.lastRefresh,
        hideBalances: state.hideBalances,
        hideDust: state.hideDust,
        riskFreeRate: state.riskFreeRate,
        // isRefreshing is intentionally excluded - should always start as false
      }),
    }
  )
);
