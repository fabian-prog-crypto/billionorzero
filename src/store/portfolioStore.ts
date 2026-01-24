import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Position, Wallet, PriceData, NetWorthSnapshot, CexAccount } from '@/types';

interface PortfolioState {
  // Data
  positions: Position[];
  wallets: Wallet[];
  accounts: CexAccount[];
  prices: Record<string, PriceData>;
  snapshots: NetWorthSnapshot[];
  lastRefresh: string | null;
  isRefreshing: boolean;
  hideBalances: boolean;

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'>) => void;
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

  // Wallet positions - replaces all positions from wallets
  setWalletPositions: (walletPositions: Position[]) => void;

  // Account positions - replaces all positions from CEX accounts
  setAccountPositions: (accountPositions: Position[]) => void;

  // Price actions
  setPrices: (prices: Record<string, PriceData>) => void;
  updatePrice: (symbol: string, price: PriceData) => void;

  // Snapshot actions
  addSnapshot: (snapshot: Omit<NetWorthSnapshot, 'id'>) => void;

  // Refresh state
  setRefreshing: (isRefreshing: boolean) => void;
  setLastRefresh: (timestamp: string) => void;

  // UI state
  toggleHideBalances: () => void;

  // Clear all data
  clearAll: () => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      positions: [],
      wallets: [],
      accounts: [],
      prices: {},
      snapshots: [],
      lastRefresh: null,
      isRefreshing: false,
      hideBalances: false,

      // Add a manual position
      addPosition: (position) => {
        const now = new Date().toISOString();
        set((state) => ({
          positions: [
            ...state.positions,
            {
              ...position,
              id: uuidv4(),
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

      // Update a single price
      updatePrice: (symbol, price) => {
        set((state) => ({
          prices: { ...state.prices, [symbol.toLowerCase()]: price },
        }));
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

      // Clear all data
      clearAll: () => {
        set({
          positions: [],
          wallets: [],
          accounts: [],
          prices: {},
          snapshots: [],
          lastRefresh: null,
          isRefreshing: false,
        });
      },
    }),
    {
      name: 'portfolio-storage',
    }
  )
);
