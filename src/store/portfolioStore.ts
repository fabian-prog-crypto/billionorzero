import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { jsonFileStorage } from './json-storage';
import { Position, Account, WalletAccount, BrokerageAccount, CashAccount, CexAccount, AssetClass, AssetType, WalletConnection, CexConnection, ManualConnection, AccountConnection, PriceData, NetWorthSnapshot, Transaction, typeFromAssetClass } from '@/types';
import { toSlug, extractCashAccountName, linkOrphanedCashPositions } from '@/services/domain/cash-account-service';
import { buildManualAccountHoldings, isManualAccountInScope } from '@/services/domain/account-role-service';
import { getCategoryService } from '@/services/domain/category-service';

// Custom price entry
export interface CustomPrice {
  price: number;
  note?: string;         // Optional note explaining why custom price is used
  setAt: string;         // ISO timestamp when set
}

interface PortfolioState {
  // Data
  positions: Position[];
  accounts: Account[];
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

  // Computed selectors (convenience filters over unified accounts[])
  walletAccounts: () => Account[];
  cexAccounts: () => Account[];
  manualAccounts: () => Account[];
  brokerageAccounts: () => Account[];
  metalAccounts: () => Account[];
  cashAccounts: () => Account[];
  wallets: () => Account[];  // Legacy alias for walletAccounts

  // Position actions
  addPosition: (position: Omit<Position, 'id' | 'addedAt' | 'updatedAt'> & { id?: string }) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;
  setAssetClassOverride: (symbol: string, override: AssetClass | null) => void;

  // Unified account CRUD
  addAccount: (account: Omit<Account, 'id' | 'addedAt'>) => string;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;

  // Replace all positions from specified accounts (generic sync)
  setSyncedPositions: (accountIds: string[], positions: Position[]) => void;

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
      accounts: [],
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

      // Computed selectors
      walletAccounts: () => get().accounts.filter((a) =>
        a.connection.dataSource === 'debank' || a.connection.dataSource === 'helius'
      ),
      cexAccounts: () => get().accounts.filter((a) =>
        ['binance', 'coinbase', 'kraken', 'okx'].includes(a.connection.dataSource)
      ),
      manualAccounts: () => get().accounts.filter((a) =>
        a.connection.dataSource === 'manual'
      ),
      brokerageAccounts: () => {
        const accounts = get().accounts;
        const positions = get().positions;
        const holdings = buildManualAccountHoldings(positions);
        return accounts.filter((a) => {
          if (a.connection.dataSource !== 'manual') return false;
          return isManualAccountInScope(holdings.get(a.id), 'brokerage');
        });
      },
      metalAccounts: () => {
        const accounts = get().accounts;
        const positions = get().positions;
        const categoryService = getCategoryService();
        const metalAccountIds = new Set(
          positions
            .filter((p) => {
              const categoryInput = p.assetClassOverride ?? p.assetClass ?? p.type;
              return !!p.accountId && categoryService.getMainCategory(p.symbol, categoryInput) === 'metals';
            })
            .map((p) => p.accountId as string)
        );
        return accounts.filter((a) => metalAccountIds.has(a.id));
      },
      cashAccounts: () => {
        const accounts = get().accounts;
        const positions = get().positions;
        const holdings = buildManualAccountHoldings(positions);
        return accounts.filter((a) => {
          if (a.connection.dataSource !== 'manual') return false;
          return isManualAccountInScope(holdings.get(a.id), 'cash');
        });
      },
      wallets: () => get().walletAccounts(),  // Legacy alias

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

      setAssetClassOverride: (symbol, override) => {
        const normalized = symbol.toLowerCase().trim();
        const categoryService = getCategoryService();
        set((state) => ({
          positions: state.positions.map((p) => {
            if (p.symbol.toLowerCase() !== normalized) return p;
            const nextOverride = override || undefined;
            const nextAssetClass = override
              ? override
              : categoryService.getAssetClass(p.symbol, p.type);
            return {
              ...p,
              assetClassOverride: nextOverride,
              assetClass: nextAssetClass,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      // Generic account CRUD
      addAccount: (account) => {
        // Dedup manual accounts by normalized name to prevent accidental duplicates
        if (account.connection.dataSource === 'manual') {
          const normalizedName = account.name.trim().toLowerCase();
          const existingByName = get().accounts.find(
            (a) =>
              a.connection.dataSource === 'manual' &&
              a.name.trim().toLowerCase() === normalizedName
          );
          if (existingByName) return existingByName.id;
        }

        // Special handling for accounts with slug: dedup by slug
        if (account.slug) {
          const slug = toSlug(account.name);
          const existing = get().accounts.find((a) => a.slug === slug);
          if (existing) return existing.id;
          const id = uuidv4();
          set((state) => ({
            accounts: [
              ...state.accounts,
              { ...account, id, slug, addedAt: new Date().toISOString() },
            ],
          }));
          return id;
        }
        const id = uuidv4();
        set((state) => ({
          accounts: [
            ...state.accounts,
            { ...account, id, addedAt: new Date().toISOString() } as Account,
          ],
        }));
        return id;
      },

      // Remove account and cascade delete linked positions
      removeAccount: (id) => {
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          positions: state.positions.filter((p) => p.accountId !== id),
        }));
      },

      // Update account details
      updateAccount: (id, updates) => {
        set((state) => ({
          accounts: state.accounts.map((a) => {
            if (a.id !== id) return a;
            // Never allow slug changes
            const { slug: _ignored, ...safeUpdates } = updates as Record<string, unknown>;
            return { ...a, ...safeUpdates } as Account;
          }),
        }));
      },

      // Replace all positions from specified accounts (generic sync)
      setSyncedPositions: (accountIds, positions) => {
        set((state) => {
          const idSet = new Set(accountIds);
          const kept = state.positions.filter((p) => !p.accountId || !idSet.has(p.accountId));
          return { positions: [...kept, ...positions] };
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
          accounts: [],
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
      storage: createJSONStorage(() => jsonFileStorage),
      version: 14,
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

        // v7 → v8: Merge 4 account arrays into unified accounts[] with type discriminant.
        // Convert protocol/walletAddress on positions to accountId.
        // Made idempotent: if accounts[] already contains unified entries (with type discriminant),
        // preserve them instead of treating all entries as old CEX accounts.
        if (version < 8) {
          const existingAccounts = (state.accounts || []) as Array<Record<string, unknown>>;
          const validTypes = ['wallet', 'brokerage', 'cash', 'cex'];

          // Detect already-migrated entries (have a valid 'type' discriminant)
          const alreadyUnified = existingAccounts.filter(a =>
            validTypes.includes(String(a.type || ''))
          );
          // Old CEX accounts don't have a 'type' field (or have an unrecognized one)
          const oldCex = existingAccounts.filter(a =>
            !validTypes.includes(String(a.type || ''))
          );

          const unifiedAccounts: Array<Record<string, unknown>> = [];
          const existingIds = new Set(alreadyUnified.map(a => String(a.id)));

          // Carry forward already-unified entries
          alreadyUnified.forEach(a => unifiedAccounts.push(a));

          // Migrate wallets → WalletAccount (only if they have data and aren't already present)
          const oldWallets = (state.wallets || []) as Array<Record<string, unknown>>;
          const addressToWalletId = new Map<string, string>();
          oldWallets.forEach((w) => {
            const id = String(w.id || uuidv4());
            if (existingIds.has(id)) {
              // Already present from a previous migration run, just build the lookup
              addressToWalletId.set(String(w.address || '').toLowerCase(), id);
              return;
            }
            addressToWalletId.set(String(w.address || '').toLowerCase(), id);
            existingIds.add(id);
            unifiedAccounts.push({
              id,
              type: 'wallet',
              name: w.name || `Wallet ${String(w.address || '').slice(0, 8)}`,
              address: w.address,
              chains: w.chains || [],
              perpExchanges: w.perpExchanges,
              addedAt: w.addedAt || new Date().toISOString(),
            });
          });

          // Also build addressToWalletId from already-unified wallet entries
          alreadyUnified.filter(a => a.type === 'wallet').forEach(w => {
            addressToWalletId.set(String(w.address || '').toLowerCase(), String(w.id));
          });

          // Migrate brokerageAccounts → BrokerageAccount
          const oldBrokerage = (state.brokerageAccounts || []) as Array<Record<string, unknown>>;
          oldBrokerage.forEach((b) => {
            if (existingIds.has(String(b.id))) return;
            existingIds.add(String(b.id));
            unifiedAccounts.push({
              id: b.id,
              type: 'brokerage',
              name: b.name,
              isActive: b.isActive ?? true,
              addedAt: b.addedAt || new Date().toISOString(),
            });
          });

          // Migrate cashAccounts → CashAccount
          const oldCash = (state.cashAccounts || []) as Array<Record<string, unknown>>;
          oldCash.forEach((c) => {
            if (existingIds.has(String(c.id))) return;
            existingIds.add(String(c.id));
            unifiedAccounts.push({
              id: c.id,
              type: 'cash',
              slug: c.slug || toSlug(String(c.name || '')),
              name: c.name,
              isActive: c.isActive ?? true,
              addedAt: c.addedAt || new Date().toISOString(),
            });
          });

          // Migrate old CEX accounts → CexAccount
          oldCex.forEach((a) => {
            if (existingIds.has(String(a.id))) return;
            existingIds.add(String(a.id));
            unifiedAccounts.push({
              id: a.id,
              type: 'cex',
              name: a.name || String(a.exchange || ''),
              exchange: a.exchange,
              apiKey: a.apiKey,
              apiSecret: a.apiSecret,
              isActive: a.isActive ?? true,
              lastSync: a.lastSync,
              addedAt: a.addedAt || new Date().toISOString(),
            });
          });

          state.accounts = unifiedAccounts;

          // Build account ID lookup maps
          const brokerageIds = new Set([
            ...oldBrokerage.map((b) => String(b.id)),
            ...alreadyUnified.filter(a => a.type === 'brokerage').map(a => String(a.id)),
          ]);
          const cashIds = new Set([
            ...oldCash.map((c) => String(c.id)),
            ...alreadyUnified.filter(a => a.type === 'cash').map(a => String(a.id)),
          ]);
          const cexIdMap = new Map<string, string>();
          oldCex.forEach((a) => {
            cexIdMap.set(`cex:${a.exchange}:${a.id}`, String(a.id));
          });
          alreadyUnified.filter(a => a.type === 'cex').forEach(a => {
            cexIdMap.set(`cex:${a.exchange}:${a.id}`, String(a.id));
          });

          // Convert positions: protocol/walletAddress → accountId
          const positions = (state.positions || []) as Array<Record<string, unknown>>;
          positions.forEach((p) => {
            // Skip positions already linked
            if (p.accountId) return;

            const protocol = String(p.protocol || '');
            const walletAddress = String(p.walletAddress || '');

            // Brokerage linking: protocol = "brokerage:abc"
            if (protocol.startsWith('brokerage:')) {
              const brokId = protocol.replace('brokerage:', '');
              if (brokerageIds.has(brokId)) {
                p.accountId = brokId;
              }
            }
            // Cash account linking: protocol = "cash-account:def"
            else if (protocol.startsWith('cash-account:')) {
              const cashId = protocol.replace('cash-account:', '');
              if (cashIds.has(cashId)) {
                p.accountId = cashId;
              }
            }
            // CEX linking: protocol = "cex:binance:ghi"
            else if (protocol.startsWith('cex:')) {
              const cexId = cexIdMap.get(protocol);
              if (cexId) {
                p.accountId = cexId;
              }
            }
            // Wallet linking: walletAddress = "0x..."
            else if (walletAddress) {
              const walletId = addressToWalletId.get(walletAddress.toLowerCase());
              if (walletId) {
                p.accountId = walletId;
              }
            }
          });

          // Clean up old arrays
          delete state.wallets;
          delete state.brokerageAccounts;
          delete state.cashAccounts;
        }

        // v8 → v12: Recovery migration for corrupted account types.
        // v10 used walletAddress (legacy field stripped after refresh) so it failed.
        // v12 uses position.type (always present, never stripped) as the source of truth.
        if (version < 12) {
          const accounts = (state.accounts || []) as Array<Record<string, unknown>>;
          const positions = (state.positions || []) as Array<Record<string, unknown>>;

          // DEBUG: trace migration input
          console.log('[v12 migration] Running. version =', version);
          console.log('[v12 migration] accounts count:', accounts.length);
          console.log('[v12 migration] positions count:', positions.length);
          console.log('[v12 migration] account types BEFORE:', accounts.map(a => `${a.name}: ${a.type}`));
          const positionsWithAccountId = positions.filter(p => p.accountId);
          console.log('[v12 migration] positions with accountId:', positionsWithAccountId.length);
          const posTypeSample = positionsWithAccountId.slice(0, 10).map(p => `${p.symbol}(type=${p.type}, accountId=${String(p.accountId).slice(0,8)})`);
          console.log('[v12 migration] sample positions:', posTypeSample);

          const perpProtocols = new Set(['hyperliquid', 'lighter', 'ethereal']);

          // Step 1: Build maps from ALL positions with accountId
          const accountPositionTypes = new Map<string, Set<string>>();
          const accountChains = new Map<string, Set<string>>();
          const accountPerps = new Map<string, Set<string>>();
          const accountWalletAddress = new Map<string, string>();

          positions.forEach(p => {
            const accountId = String(p.accountId || '');
            if (!accountId) return;

            const posType = String(p.type || '');
            const chain = String(p.chain || '');
            const protocol = String(p.protocol || '');
            const walletAddress = String(p.walletAddress || '');

            // Collect position types per account
            if (posType) {
              if (!accountPositionTypes.has(accountId)) {
                accountPositionTypes.set(accountId, new Set());
              }
              accountPositionTypes.get(accountId)!.add(posType);
            }

            // Collect chains per account
            if (chain) {
              if (!accountChains.has(accountId)) {
                accountChains.set(accountId, new Set());
              }
              accountChains.get(accountId)!.add(chain);
            }

            // Collect perp exchanges from protocol
            if (protocol && perpProtocols.has(protocol.toLowerCase())) {
              if (!accountPerps.has(accountId)) {
                accountPerps.set(accountId, new Set());
              }
              accountPerps.get(accountId)!.add(protocol.toLowerCase());
            }

            // Collect walletAddress (legacy field, may still exist on some positions)
            if (walletAddress) {
              accountWalletAddress.set(accountId, walletAddress.toLowerCase());
            }
          });

          // Step 2: Classify each account using position types
          accounts.forEach(a => {
            const id = String(a.id || '');
            const types = accountPositionTypes.get(id) || new Set<string>();

            // Priority 1: CEX (account-level fields, always reliable)
            if (a.exchange && a.apiKey) {
              a.type = 'cex';
              a.isActive = a.isActive ?? true;
            }
            // Priority 2: Cash (any linked position has type 'cash')
            else if (types.has('cash')) {
              a.type = 'cash';
              a.slug = a.slug || toSlug(String(a.name || ''));
              a.isActive = a.isActive ?? true;
            }
            // Priority 3: Brokerage (any linked position has type 'stock' or 'etf')
            else if (types.has('stock') || types.has('etf')) {
              a.type = 'brokerage';
              a.isActive = a.isActive ?? true;
            }
            // Priority 4: Wallet (any linked position has type 'crypto')
            else if (types.has('crypto')) {
              a.type = 'wallet';
              // Restore address from walletAddress on positions, existing field, or empty
              a.address = accountWalletAddress.get(id) || a.address || '';
              const chains = accountChains.get(id);
              a.chains = chains ? Array.from(chains) : (a.chains || []);
              const perps = accountPerps.get(id);
              if (perps && perps.size > 0) {
                a.perpExchanges = Array.from(perps);
              }
            }
            // Priority 5: No linked positions — keep existing type or default to brokerage
            else {
              // If already classified from a prior migration, keep it
              const existingType = String(a.type || '');
              if (!['wallet', 'brokerage', 'cash', 'cex'].includes(existingType)) {
                a.type = 'brokerage';
              }
              a.isActive = a.isActive ?? true;
            }
          });

          // DEBUG: trace migration output
          console.log('[v12 migration] account types AFTER:', accounts.map(a => `${a.name}: ${a.type}`));
          const walletCount = accounts.filter(a => a.type === 'wallet').length;
          const cashCount = accounts.filter(a => a.type === 'cash').length;
          const brokCount = accounts.filter(a => a.type === 'brokerage').length;
          const cexCount = accounts.filter(a => a.type === 'cex').length;
          console.log(`[v12 migration] Result: ${walletCount} wallet, ${cashCount} cash, ${brokCount} brokerage, ${cexCount} cex`);
        }

        // v12 → v13: Account connection model + Position assetClass
        if (version < 13) {
          const accounts = (state.accounts || []) as Array<Record<string, unknown>>;
          const positions = (state.positions || []) as Array<Record<string, unknown>>;

          console.log('[v13 migration] Running. version =', version);

          // --- Step 1: Migrate accounts from type-based to connection-based ---
          const perpProtocols = new Set(['hyperliquid', 'lighter', 'ethereal']);

          // Build position data per account (for inference)
          const accountPositionTypes = new Map<string, Set<string>>();
          const accountChains = new Map<string, Set<string>>();
          const accountPerps = new Map<string, Set<string>>();

          positions.forEach(p => {
            const accountId = String(p.accountId || '');
            if (!accountId) return;
            const posType = String(p.type || '');
            const chain = String(p.chain || '');
            const protocol = String(p.protocol || '');

            if (posType) {
              if (!accountPositionTypes.has(accountId)) accountPositionTypes.set(accountId, new Set());
              accountPositionTypes.get(accountId)!.add(posType);
            }
            if (chain) {
              if (!accountChains.has(accountId)) accountChains.set(accountId, new Set());
              accountChains.get(accountId)!.add(chain);
            }
            if (protocol && perpProtocols.has(protocol.toLowerCase())) {
              if (!accountPerps.has(accountId)) accountPerps.set(accountId, new Set());
              accountPerps.get(accountId)!.add(protocol.toLowerCase());
            }
          });

          // Build accountId → walletAddress from positions (recovers addresses lost in v7→v8 migration)
          const accountAddress = new Map<string, string>();
          positions.forEach(p => {
            const accountId = String(p.accountId || '');
            const walletAddr = String(p.walletAddress || '');
            if (accountId && walletAddr && walletAddr !== 'undefined') {
              accountAddress.set(accountId, walletAddr);
            }
          });

          // Helper: detect if address is Solana
          const isSolanaAddress = (addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

          accounts.forEach(a => {
            const id = String(a.id || '');

            // --- Fix already-migrated accounts that were misclassified as manual ---
            if (a.connection && typeof a.connection === 'object') {
              const conn = a.connection as Record<string, unknown>;
              if (conn.dataSource === 'manual') {
                // Check if positions reveal this is actually a wallet
                const recoveredAddr = accountAddress.get(id);
                if (recoveredAddr) {
                  const dataSource = isSolanaAddress(recoveredAddr) ? 'helius' : 'debank';
                  const chains = accountChains.get(id);
                  const perps = accountPerps.get(id);
                  a.connection = {
                    dataSource,
                    address: recoveredAddr,
                    chains: chains ? Array.from(chains) : [],
                    perpExchanges: perps ? Array.from(perps) : undefined,
                  };
                  console.log(`[v13 migration] Fixed misclassified wallet: ${a.name} → ${recoveredAddr.slice(0, 10)}...`);
                }
              }
              return; // Already has connection, skip initial assignment
            }

            // --- Initial migration for accounts without connection ---
            const address = String(a.address || '') || accountAddress.get(id) || '';

            // Priority 1: Has exchange + apiKey → CexConnection
            if (a.exchange && a.apiKey) {
              a.connection = {
                dataSource: String(a.exchange),
                apiKey: a.apiKey,
                apiSecret: a.apiSecret || '',
                lastSync: a.lastSync,
              };
              a.isActive = a.isActive ?? true;
            }
            // Priority 2: Has address (on account OR from positions) → WalletConnection
            else if (address && address !== 'undefined' && address !== '') {
              const dataSource = isSolanaAddress(address) ? 'helius' : 'debank';
              const chains = accountChains.get(id);
              const perps = accountPerps.get(id);
              a.connection = {
                dataSource,
                address,
                chains: chains ? Array.from(chains) : (Array.isArray(a.chains) ? a.chains : []),
                perpExchanges: perps ? Array.from(perps) : (Array.isArray(a.perpExchanges) ? a.perpExchanges : undefined),
              };
              a.isActive = a.isActive ?? true;
            }
            // Priority 3: All remaining → ManualConnection
            else {
              a.connection = { dataSource: 'manual' };
              a.isActive = a.isActive ?? true;
            }

            // Clean up old type-based fields (keep address on wallet connections for reference)
            delete a.type;
            delete a.exchange;
            delete a.apiKey;
            delete a.apiSecret;
            delete a.lastSync;
            delete a.chains;
            delete a.perpExchanges;
          });

          // --- Step 2: Merge duplicate-name manual accounts ---
          const manualByName = new Map<string, Record<string, unknown>>();
          const mergeMap = new Map<string, string>(); // old ID → canonical ID

          accounts.forEach(a => {
            const conn = a.connection as Record<string, unknown>;
            if (conn?.dataSource !== 'manual') return;

            const name = String(a.name || '').trim().toLowerCase();
            if (manualByName.has(name)) {
              // This is a duplicate — map its ID to the canonical account
              mergeMap.set(String(a.id), String(manualByName.get(name)!.id));
            } else {
              manualByName.set(name, a);
            }
          });

          // Re-link positions from merged accounts
          if (mergeMap.size > 0) {
            positions.forEach(p => {
              const oldId = String(p.accountId || '');
              if (mergeMap.has(oldId)) {
                p.accountId = mergeMap.get(oldId);
              }
            });
            // Remove merged accounts
            state.accounts = accounts.filter(a => !mergeMap.has(String(a.id)));
          }

          // --- Step 3: Migrate positions: type → assetClass ---
          positions.forEach(p => {
            // Skip if already has assetClass
            if (p.assetClass) return;

            const posType = String(p.type || 'manual');
            switch (posType) {
              case 'crypto':
                p.assetClass = 'crypto';
                break;
              case 'stock':
                p.assetClass = 'equity';
                p.equityType = 'stock';
                break;
              case 'etf':
                p.assetClass = 'equity';
                p.equityType = 'etf';
                break;
              case 'cash':
                p.assetClass = 'cash';
                break;
              case 'manual':
              default:
                p.assetClass = 'other';
                break;
            }
          });

          // --- Step 4: Migrate snapshots ---
          const snapshots = (state.snapshots || []) as Array<Record<string, unknown>>;
          snapshots.forEach(s => {
            if (s.equityValue === undefined && s.stockValue !== undefined) {
              s.equityValue = s.stockValue;
            }
            if (s.otherValue === undefined && s.manualValue !== undefined) {
              s.otherValue = s.manualValue;
            }
            // Keep old fields for backward compat
          });

          console.log('[v13 migration] Complete.', {
            accounts: (state.accounts as Array<Record<string, unknown>>).length,
            positions: positions.length,
            merged: mergeMap.size,
          });
        }

        // v13 → v14: Reclassify metals + add metalsValue on snapshots
        if (version < 14) {
          console.log('[v14 migration] Running. version =', version);
          const categoryService = getCategoryService();
          const positions = (state.positions || []) as Array<Record<string, unknown>>;
          positions.forEach(p => {
            const symbol = String(p.symbol || '');
            const type = String(p.type || 'manual');
            p.assetClass = categoryService.getAssetClass(symbol, type);
          });

          const snapshots = (state.snapshots || []) as Array<Record<string, unknown>>;
          snapshots.forEach(s => {
            if (s.metalsValue === undefined) {
              s.metalsValue = 0;
            }
          });

          console.log('[v14 migration] Complete.', {
            positions: positions.length,
            snapshots: snapshots.length,
          });
        }

        return state as unknown as PortfolioState;
      },
      onRehydrateStorage: () => {
        return () => {
          // Link legacy/orphan cash positions back to account IDs.
          const currentState = usePortfolioStore.getState();
          const result = linkOrphanedCashPositions(currentState.positions, currentState.accounts);
          if (result) {
            usePortfolioStore.setState({
              positions: result.positions,
              accounts: result.accounts,
            });
          }
        };
      },
      // Don't persist volatile UI state - this prevents sync from getting stuck
      partialize: (state) => ({
        positions: state.positions,
        accounts: state.accounts,
        prices: state.prices,
        customPrices: state.customPrices,
        fxRates: state.fxRates,
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
