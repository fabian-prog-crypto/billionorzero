# Architecture Reference

Comprehensive architecture, data model, and service reference for Billion or Zero.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                             │
│  Next.js App Router pages, React components, hooks          │
├─────────────────────────────────────────────────────────────┤
│                     State Layer                             │
│  Zustand stores (portfolioStore, authStore, themeStore)     │
│  localStorage persistence, JSON file sync                   │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
│  PortfolioService orchestrator                              │
│  ├── Providers   (data fetching, caching, fallbacks)        │
│  ├── Domain      (pure business logic, calculations)        │
│  └── Config      (API key management)                       │
├─────────────────────────────────────────────────────────────┤
│                   API Route Layer                           │
│  Next.js route handlers (CORS proxy + REST endpoints)       │
├─────────────────────────────────────────────────────────────┤
│                   External APIs                             │
│  DeBank, Helius, Birdeye, CoinGecko, Finnhub, Binance,     │
│  Hyperliquid, Lighter, Ethereal, FX API, Ollama             │
└─────────────────────────────────────────────────────────────┘
```

**UI Layer** -- React pages and components. Reads from Zustand stores, triggers refreshes.

**State Layer** -- Three Zustand stores persisted to localStorage. `db.json` server-side mirror kept in sync for CMD-K.

**Service Layer** -- Layered architecture: API clients (HTTP only) -> Providers (caching, fallbacks) -> Domain (pure logic). All coordinated by `PortfolioService`.

**API Route Layer** -- Next.js route handlers serving two roles: CORS proxy for external APIs, and REST endpoints for CMD-K/server-side operations.

**External APIs** -- Third-party data sources for wallet balances, prices, exchange data, and LLM inference.

---

## 2. Data Model

### Entity Relationships

```
Account ──1:N──> Position
  │                  │
  ├─ id              ├─ accountId (FK to Account.id)
  ├─ name            ├─ assetClass: crypto|equity|cash|other
  ├─ isActive        ├─ type (deprecated)
  └─ connection:     ├─ symbol, name, amount
     │               ├─ costBasis?, purchaseDate?
     ├─ Wallet       ├─ chain?, protocol?
     │  (debank|     ├─ isDebt?, equityType?
     │   helius,     └─ detailTypes?, unlockAt?
     │   address)
     ├─ CEX
     │  (binance|coinbase|kraken|okx,
     │   apiKey, apiSecret)
     └─ Manual
        (dataSource: 'manual')

Position ──1:N──> Transaction
  │                  │
  └─ id              ├─ positionId (FK)
                     ├─ type: buy|sell|transfer
                     ├─ amount, pricePerUnit, totalValue
                     └─ realizedPnL?

NetWorthSnapshot (daily, standalone)
  ├─ date, totalValue
  ├─ cryptoValue, equityValue, cashValue, otherValue
  └─ stockValue?, manualValue? (deprecated aliases)
```

### Core Types

#### `Account`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `name` | `string` | Display name |
| `isActive` | `boolean` | Sync enabled |
| `connection` | `AccountConnection` | Discriminated union (see below) |
| `slug?` | `string` | Legacy cash-account dedup |
| `addedAt` | `string` | ISO timestamp |

#### `AccountConnection` (discriminated union)

| Variant | `dataSource` | Extra Fields |
|---------|-------------|--------------|
| `WalletConnection` | `'debank'` \| `'helius'` | `address`, `chains?`, `perpExchanges?` |
| `CexConnection` | `'binance'` \| `'coinbase'` \| `'kraken'` \| `'okx'` | `apiKey`, `apiSecret`, `lastSync?` |
| `ManualConnection` | `'manual'` | (none) |

#### `Position`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `assetClass` | `AssetClass` | `'crypto'` \| `'equity'` \| `'cash'` \| `'other'` |
| `type` | `AssetType` | **Deprecated.** `'crypto'` \| `'stock'` \| `'etf'` \| `'cash'` \| `'manual'` |
| `symbol` | `string` | Ticker/symbol |
| `name` | `string` | Display name |
| `amount` | `number` | Quantity held |
| `costBasis?` | `number` | Total cost in USD at acquisition |
| `purchaseDate?` | `string` | ISO date for CAGR/returns |
| `accountId?` | `string` | FK to `Account.id` |
| `chain?` | `string` | Blockchain (eth, sol, bsc, ...) |
| `debankPriceKey?` | `string` | DeBank price lookup key |
| `protocol?` | `string` | DeFi protocol or perp exchange name |
| `isDebt?` | `boolean` | Borrowed/debt position |
| `detailTypes?` | `string[]` | DeBank detail types (vesting, locked) |
| `unlockAt?` | `number` | Unix timestamp for vesting unlock |
| `logo?` | `string` | Token logo URL |
| `equityType?` | `'stock'` \| `'etf'` | Sub-type within equity class |
| `addedAt` | `string` | ISO timestamp |
| `updatedAt` | `string` | ISO timestamp |

#### `PriceData`

| Field | Type |
|-------|------|
| `symbol` | `string` |
| `price` | `number` |
| `change24h` | `number` |
| `changePercent24h` | `number` |
| `lastUpdated` | `string` |

#### `CustomPrice`

| Field | Type | Notes |
|-------|------|-------|
| `price` | `number` | Override price |
| `note?` | `string` | Reason for override |
| `setAt` | `string` | ISO timestamp |

#### `AssetWithPrice` (extends Position)

| Field | Type | Notes |
|-------|------|-------|
| `currentPrice` | `number` | |
| `value` | `number` | Negative for debt |
| `change24h` | `number` | |
| `changePercent24h` | `number` | |
| `allocation` | `number` | Negative for debt |
| `hasCustomPrice?` | `boolean` | Using custom override |
| `isPerpNotional?` | `boolean` | Perp notional exposure |

#### `Transaction`

| Field | Type |
|-------|------|
| `id` | `string` |
| `type` | `'buy'` \| `'sell'` \| `'transfer'` |
| `symbol` | `string` |
| `name` | `string` |
| `assetType` | `AssetType` |
| `amount` | `number` |
| `pricePerUnit` | `number` |
| `totalValue` | `number` |
| `costBasisAtExecution?` | `number` |
| `realizedPnL?` | `number` |
| `positionId` | `string` |
| `date` | `string` |
| `notes?` | `string` |
| `createdAt` | `string` |

#### `NetWorthSnapshot`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | |
| `date` | `string` | ISO date |
| `totalValue` | `number` | |
| `cryptoValue` | `number` | |
| `equityValue` | `number` | |
| `cashValue` | `number` | |
| `otherValue` | `number` | |
| `stockValue?` | `number` | Deprecated alias for equityValue |
| `manualValue?` | `number` | Deprecated alias for otherValue |

#### `DefiPosition`

| Field | Type |
|-------|------|
| `protocol` | `string` |
| `chain` | `string` |
| `type` | `string` |
| `value` | `number` |
| `tokens` | `{ symbol, amount, price, detailTypes?, unlockAt? }[]` |
| `debtTokens?` | `{ symbol, amount, price }[]` |

#### `ParsedPositionAction` (CMD-K)

| Field | Type | Notes |
|-------|------|-------|
| `action` | `PositionActionType` | `buy` \| `sell_partial` \| `sell_all` \| `add_cash` \| `remove` \| `set_price` \| `update_position` |
| `symbol` | `string` | |
| `name?` | `string` | |
| `assetType` | `AssetType` | |
| `amount?` | `number` | |
| `pricePerUnit?` | `number` | |
| `totalCost?` | `number` | |
| `confidence` | `number` | LLM confidence score |
| `summary` | `string` | Human-readable description |
| `matchedPositionId?` | `string` | Existing position match |
| `matchedAccountId?` | `string` | Target account |
| `missingFields?` | `string[]` | Fields needing user input |

Legacy compatibility note: inbound `update_cash` actions are normalized to `update_position` (cash mode) at runtime.

### Enum Types

| Type | Values |
|------|--------|
| `AssetClass` | `'crypto'` \| `'equity'` \| `'cash'` \| `'other'` |
| `AssetType` (deprecated) | `'crypto'` \| `'stock'` \| `'etf'` \| `'cash'` \| `'manual'` |
| `DataSourceType` | `'debank'` \| `'helius'` \| `'binance'` \| `'coinbase'` \| `'kraken'` \| `'okx'` \| `'manual'` |
| `PerpExchange` | `'hyperliquid'` \| `'lighter'` \| `'ethereal'` |
| `CexExchange` | `'binance'` \| `'coinbase'` \| `'kraken'` \| `'okx'` |
| `PositionActionType` | `'buy'` \| `'sell_partial'` \| `'sell_all'` \| `'add_cash'` \| `'remove'` \| `'set_price'` \| `'update_position'` |

### Account / Asset Class Matrix

| Account Type | Crypto | Equities | Cash |
|:---|:---:|:---:|:---:|
| **Crypto Wallet** | Yes | -- | Stablecoins |
| **CEX Account** | Yes | -- | Stablecoins |
| **Brokerage** | -- | Yes | Yes |
| **Bank Account** | -- | -- | Yes |

Account type (how you connect) and asset class (what you hold) are orthogonal. A wallet holds crypto and stablecoins. A brokerage holds equities and cash. The `AssetClass` on each `Position` is independent of its parent account.

### Business Invariant: Brokerage Settlement

- A brokerage account is a mixed manual account that can hold both `equity` and `cash` positions under the same `accountId`.
- For equity trades, cash settlement must happen on the same brokerage `accountId` as the equity position.
- Default settlement currency for equities is USD.
- Splitting equities and brokerage USD cash across different account IDs is considered a data inconsistency unless intentionally modeling different brokers.

---

## 3. State Management

### Three Zustand Stores

```
┌──────────────────────────────────────────────────────────┐
│ portfolioStore (v13)         key: 'portfolio-storage'    │
│ ─────────────────────────────────────────────────────    │
│ positions[], accounts[], prices{}, customPrices{}        │
│ fxRates{}, transactions[], snapshots[]                   │
│ lastRefresh, isRefreshing, hideBalances, hideDust        │
│ riskFreeRate                                             │
│ ─────────────────────────────────────────────────────    │
│ Selectors: walletAccounts(), cexAccounts(),              │
│            manualAccounts(), brokerageAccounts(),         │
│            cashAccounts()                                │
│ Actions:   addPosition, removePosition, updatePosition,  │
│            addAccount, removeAccount, setSyncedPositions, │
│            setPrices, setFxRates, setCustomPrice,        │
│            addTransaction, addSnapshot, clearAll         │
├──────────────────────────────────────────────────────────┤
│ authStore                    key: 'auth-storage'         │
│ ─────────────────────────────────────────────────────    │
│ isAuthenticated, isPasskeyEnabled, loginTimestamp         │
│ ─────────────────────────────────────────────────────    │
│ 30-day session expiry. Auto-logout on rehydration if     │
│ expired. WebAuthn passkey optional.                      │
├──────────────────────────────────────────────────────────┤
│ themeStore                   key: 'theme-storage'        │
│ ─────────────────────────────────────────────────────    │
│ theme: 'light' | 'dark' | 'system'                      │
│ ─────────────────────────────────────────────────────    │
│ Resolves 'system' via matchMedia. Sets data-theme on     │
│ <html>. Listens for OS preference changes.               │
└──────────────────────────────────────────────────────────┘
```

### Persistence

- **Persisted fields** (survive page reload): positions, accounts, prices, customPrices, fxRates, transactions, snapshots, lastRefresh, hideBalances, hideDust, riskFreeRate
- **Transient fields** (reset on reload): isRefreshing
- **Storage adapter**: `jsonFileStorage` -- writes to both localStorage and server-side `db.json` (via `/api/db`)
- **Server mirror**: `data/db.json` kept in sync by `useDbSync()` hook (2-second debounce) for CMD-K access

### Migration Chain

| Version | Key Changes |
|:---:|---|
| 2 | Initial persisted schema |
| 3 | Add `transactions[]` |
| 4 | Add `brokerageAccounts[]`, tag existing equities |
| 5 | Add `cashAccounts[]`, tag existing cash positions |
| 6 | Ensure `cashAccounts[]` exists |
| 7 | Rebuild cash accounts from positions with slug matching |
| 8 | Merge 4 account arrays into unified `accounts[]` with type discriminant |
| 9-11 | (skipped) |
| 12 | Recovery migration for corrupted account types |
| **13** | **Current.** `AccountConnection` discriminated union. Migrate `type` to `assetClass` on positions. `equityValue`/`otherValue` on snapshots. Merge duplicate manual accounts. |

---

## 4. Services Architecture

```
PortfolioService (Orchestrator)
│
├── WalletProvider
│   ├── DeBank API ─────── /api/debank/tokens, /api/debank/protocols
│   ├── Helius API ─────── /api/solana/tokens
│   ├── Birdeye API ────── /api/solana/birdeye (fallback for Helius)
│   ├── HyperliquidProvider ── /api/perps/hyperliquid
│   ├── LighterProvider ────── /api/perps/lighter
│   ├── EtherealProvider ───── /api/perps/ethereal
│   └── CexProvider ────────── /api/cex/binance
│
├── PriceProvider (facade)
│   ├── CryptoPriceService ── CoinGecko (free tier, 1s rate limit)
│   └── StockPriceService ─── Finnhub
│
├── FX API ──────────────── Currency conversion rates
│
└── Domain (pure logic, no I/O)
    ├── PortfolioCalculator ── classify, calculate, aggregate
    ├── CategoryService ────── asset categorization
    ├── SnapshotManager ────── daily net worth snapshots
    ├── PerformanceMetrics ─── Sharpe, CAGR, drawdown
    ├── PerpExchangeService ── exchange registry
    ├── PositionOperations ─── CRUD helpers
    ├── CashAccountService ─── slug utilities
    ├── IntentRouter ───────── CMD-K intent classification
    ├── ToolRegistry ───────── Ollama tool definitions
    ├── ActionMapper ───────── tool calls to pending actions
    └── PromptBuilder ──────── LLM prompt construction
```

### API Layer (`services/api/`)

Pure HTTP clients. No business logic. Each exports a singleton via factory function.

| Client | External Service |
|--------|-----------------|
| `coingecko-api.ts` | CoinGecko REST API |
| `debank-api.ts` | DeBank Pro API |
| `stock-api.ts` | Finnhub stock API |
| `helius-api.ts` | Helius Solana DAS API |
| `birdeye-api.ts` | Birdeye Solana API |
| `hyperliquid-api.ts` | Hyperliquid API |
| `lighter-api.ts` | Lighter (Solana) API |
| `ethereal-api.ts` | Ethereal API |
| `fx-api.ts` | FX rates API |

All raise `ApiError` with status code and service name on failure.

### Provider Layer (`services/providers/`)

Data fetching with fallback strategies and caching.

| Provider | Strategy |
|----------|----------|
| `wallet-provider.ts` | Aggregates DeBank + Solana + perps. Helius -> Birdeye fallback for Solana. |
| `price-provider.ts` | Unified facade over crypto + stock pricing |
| `crypto-price-service.ts` | CoinGecko with 1-second rate limiting |
| `stock-price-service.ts` | Finnhub quotes |
| `stock-logo-service.ts` | Stock logo/info |
| `cex-provider.ts` | CEX account data (Binance, Coinbase, Kraken, OKX) |
| `hyperliquid-provider.ts` | Hyperliquid perp data |
| `lighter-provider.ts` | Lighter perp data |
| `ethereal-provider.ts` | Ethereal perp data |
| `demo-data.ts` | Synthetic data when APIs unavailable |

Cache: localStorage TTL cache (`services/utils/cache.ts`) with 5-minute default.

### Domain Layer (`services/domain/`)

Pure business logic. No external dependencies, no I/O.

| Module | Purpose |
|--------|---------|
| `portfolio-calculator.ts` | Core calculations: enrich positions with prices, aggregate summaries, exposure metrics, risk profile, perp stats, dust filtering |
| `category-service.ts` | Asset categorization: main categories (crypto, equities, cash, other), sub-categories, exposure categories, token classification sets |
| `snapshot-manager.ts` | Daily net worth snapshot creation and deduplication |
| `performance-metrics.ts` | Sharpe ratio, CAGR, max drawdown |
| `perp-exchange-service.ts` | Perp exchange metadata registry |
| `position-operations.ts` | Position CRUD operations for server-side db |
| `cash-account-service.ts` | Cash account slug utilities |
| `intent-router.ts` | Local intent classification for CMD-K (fast pre-filter) |
| `tool-registry.ts` | Ollama tool definitions for CMD-K |
| `action-mapper.ts` | Maps LLM tool calls to confirmation actions |
| `prompt-builder.ts` | LLM system prompt construction |
| `command-types.ts` | CMD-K command type definitions |

### Config Layer (`services/config/`)

`ConfigManager` singleton in `service-config.ts`. Reads API keys from localStorage. No `.env` files -- all keys managed via Settings page.

---

## 5. Portfolio Refresh Flow

```
User clicks Refresh
  │
  ▼
PortfolioProvider.executeRefresh(forceRefresh: true)
  │
  ├── Guard: skip if already refreshing (shared state lock)
  │
  ▼
PortfolioService.refreshPortfolio(manualPositions, accounts)
  │
  ├── ConfigManager.loadFromStorage()  (get latest API keys)
  │
  ├── [PARALLEL] WalletProvider.fetchAllWalletPositions(accounts)
  │   │
  │   ├── For each wallet account:
  │   │   ├── DeBank: all_token_list + all_complex_protocol_list
  │   │   ├── Helius: getAssetsByOwner (paginated, max 10 pages)
  │   │   └── Birdeye: wallet token list (fallback if Helius fails)
  │   │
  │   ├── For each CEX account:
  │   │   └── Binance: account balances (HMAC-signed)
  │   │
  │   └── For each perp exchange on wallet:
  │       ├── Hyperliquid: clearinghouse state + spot balances
  │       ├── Lighter: account positions + balances
  │       └── Ethereal: subaccount + balance + positions
  │
  │   Returns: { positions[], prices{} (DeBank prices) }
  │
  ├── [PARALLEL] PriceProvider.getCryptoPrices(walletCoinIds)
  │   └── CoinGecko: 24h change data for wallet tokens
  │
  ├── Merge DeBank prices + CoinGecko 24h changes
  │
  ├── PriceProvider.getPricesForPositions(manualPositions)
  │   ├── CryptoPriceService (CoinGecko) for crypto
  │   └── StockPriceService (Finnhub) for equities
  │
  └── getAllFxRates() (currency conversion)
  │
  ▼
Returns: { prices, walletPositions, fxRates, isDemo, errors? }
  │
  ▼
Zustand store updated:
  ├── setSyncedPositions(accountIds, walletPositions)
  ├── setPrices(mergedPrices)
  ├── setFxRates(rates)
  └── setLastRefresh(now)
  │
  ▼
Daily snapshot taken if needed (SnapshotManager)
  │
  ▼
Background hooks fire:
  ├── useDbSync: POST /api/portfolio/sync (2s debounce)
  └── useAutoBackup: POST /api/backup (5s debounce)
```

---

## 6. Exposure Classification

`classifyAssetExposure()` in `portfolio-calculator.ts` is the **single source of truth** for how assets map to exposure buckets.

### Decision Tree

```
Asset
  │
  ├── On perp exchange? (protocol is perp exchange name)
  │   │
  │   ├── YES ──> Perp trade? (name contains "Long" or "Short")
  │   │   │
  │   │   ├── YES ──> Long? ──> perp-long
  │   │   │          Short? ──> perp-short
  │   │   │
  │   │   └── NO ───> Stablecoin? ──> perp-margin
  │   │               Other?       ──> perp-spot
  │   │
  │   └── NO (not on perp exchange)
  │       │
  │       ├── Cash equivalent? (stablecoin or Pendle PT)
  │       │   │
  │       │   ├── Is debt? ──> borrowed-cash
  │       │   └── Not debt ──> cash
  │       │
  │       └── Not cash equivalent
  │           │
  │           ├── Is debt? ──> spot-short
  │           └── Not debt ──> spot-long
```

### 8 Exposure Classifications

| Classification | Description | Example |
|---------------|-------------|---------|
| `perp-long` | Long perpetual futures (notional exposure) | ETH Long on Hyperliquid |
| `perp-short` | Short perpetual futures (notional exposure) | BTC Short on Lighter |
| `perp-margin` | Stablecoin margin on perp exchange | USDC on Hyperliquid |
| `perp-spot` | Non-margin spot on perp exchange | ETH spot on Hyperliquid |
| `spot-long` | Regular long exposure | ETH in wallet, AAPL in brokerage |
| `spot-short` | Borrowed crypto (actual short exposure) | Borrowed ETH on Aave |
| `cash` | Cash equivalents (stablecoins, Pendle PTs) | USDC in wallet |
| `borrowed-cash` | Borrowed stablecoins (leverage, NOT short) | Borrowed USDC on Morpho |

**Key insight**: Borrowed stablecoins = leverage (borrowed-cash), NOT short exposure. Only borrowed non-stablecoin crypto = actual short exposure (spot-short).

### Exposure Metrics

```
grossExposure = |longExposure| + |shortExposure|
netExposure   = longExposure - shortExposure
leverage      = (grossExposure + |debts|) / netWorth
cashPosition  = cash / netWorth
```

---

## 7. Asset Category System

### Category Hierarchy

```
All Assets
├── Crypto
│   ├── BTC (btc, wbtc, cbbtc, lbtc, ...)
│   ├── ETH (eth, weth, steth, wsteth, reth, cbeth, ...)
│   ├── SOL (sol, wsol, msol, jitosol, ...)
│   ├── Stablecoins (usdt, usdc, dai, euroc, gbpt, ...)
│   ├── DeFi (uni, aave, mkr, ldo, morpho, pendle, ...)
│   ├── RWA (ondo, paxg, xaut, ...)
│   ├── Privacy (xmr, zec, dash, ...)
│   ├── AI (fet, rndr, tao, grt, wld, ...)
│   ├── Meme (doge, shib, pepe, bonk, wif, ...)
│   ├── Perps (positions on perp exchanges)
│   └── Tokens (everything else)
│
├── Equities
│   ├── Stocks
│   └── ETFs (spy, voo, qqq, gbtc, ethe, ...)
│
├── Cash
│   └── Fiat currencies (36: usd, eur, gbp, chf, jpy, ...)
│
└── Other
    └── Manually tracked assets
```

### Exposure Categories (granular crypto breakdown)

| Category | Color | Examples |
|----------|-------|---------|
| Stablecoins | `#26a69a` | USDC, USDT, DAI, EUROC |
| ETH | `#627eea` | ETH, stETH, wstETH, rETH |
| DeFi | `#8b5cf6` | UNI, AAVE, MKR, LDO |
| BTC | `#f7931a` | BTC, WBTC, cbBTC |
| RWA | `#78909c` | ONDO, PAXG, XAUT |
| SOL | `#00ffa3` | SOL, mSOL, jitoSOL |
| Privacy | `#607d8b` | XMR, ZEC, DASH |
| AI | `#00bcd4` | FET, RNDR, TAO |
| Meme | `#ff9800` | DOGE, SHIB, PEPE |
| Tokens | `#9e9e9e` | Everything else |

---

## 8. API Routes

33 route files, organized by function.

### Authentication

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/auth/token` | POST, DELETE | Generate / revoke HMAC session token | No |

### CMD-K / Chat

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/chat` | POST | Ollama tool calling. Intent router -> filtered tools -> LLM -> execution. Max 5 rounds. | Yes |

### Portfolio: Positions

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/portfolio/positions` | GET, POST, DELETE | List (with filters: accountId, assetClass, search, sort, top), create, bulk delete | Yes |
| `/api/portfolio/positions/[id]` | GET, PUT, DELETE | Get with price, update, delete (with optional sell transaction) | Yes |
| `/api/portfolio/positions/[id]/sell` | POST | Execute partial/full sell with transaction recording | Yes |
| `/api/portfolio/positions/bulk` | POST | Bulk create positions from array | Yes |

### Portfolio: Accounts

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/portfolio/accounts` | GET, POST | List (filter by type: wallet/cex/brokerage/cash), create with dedup | Yes |
| `/api/portfolio/accounts/[id]` | GET, PUT, DELETE | Single account CRUD | Yes |
| `/api/portfolio/accounts/[id]/sync` | POST | Trigger sync for single account | Yes |

### Portfolio: Prices

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/portfolio/prices` | GET | All prices (market + custom overrides) | Yes |
| `/api/portfolio/prices/[symbol]` | GET, PUT, DELETE | Get price, set custom price, remove custom price | Yes |

### Portfolio: Analytics

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/portfolio/summary` | GET | Net worth, gross assets, debts, category breakdowns | Yes |
| `/api/portfolio/exposure` | GET | Long/short/gross/net exposure, leverage, cash position | Yes |
| `/api/portfolio/performance` | GET | Sharpe ratio, CAGR, drawdown (requires 2+ snapshots) | Yes |
| `/api/portfolio/risk` | GET | Risk profile calculation | Yes |
| `/api/portfolio/debt` | GET | Debt positions summary | Yes |
| `/api/portfolio/perps` | GET | Perp exchange statistics | Yes |

### Portfolio: Other Data

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/portfolio/transactions` | GET, POST | List (filter by symbol, positionId), create | Yes |
| `/api/portfolio/snapshots` | GET, POST | List snapshots (with date range), take new snapshot | Yes |
| `/api/portfolio/fx` | GET | Current FX rates | Yes |
| `/api/portfolio/settings` | GET, PUT | Read/update settings (riskFreeRate, hideDust, etc.) | Yes |
| `/api/portfolio/sync` | POST | Sync client state to db.json (guards against empty writes) | Yes |

### Database & Backup

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/db` | GET, PUT | Read/write db.json directly. GET seeds from backup if missing. PUT guards against small overwrites. | No |
| `/api/backup` | GET, POST | List/retrieve backups, create current.json + daily backup (max 30) | No |

### External Data Proxies (CORS bypass)

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/debank/tokens` | GET | DeBank `all_token_list` (excludes protocol receipts) | No |
| `/api/debank/protocols` | GET | DeBank `all_complex_protocol_list` (DeFi positions) | No |
| `/api/solana/tokens` | GET | Helius DAS `getAssetsByOwner` (paginated, max 10 pages) | No |
| `/api/solana/birdeye` | GET | Birdeye wallet token list (Helius fallback) | No |
| `/api/cex/binance` | GET, POST | Binance proxy. GET: public endpoints. POST: authenticated (HMAC-SHA256). | No |
| `/api/perps/hyperliquid` | POST | Hyperliquid JSON-RPC proxy | No |
| `/api/perps/lighter` | GET | Lighter account/position/asset queries | No |
| `/api/perps/ethereal` | GET | Ethereal subaccount/balance/position queries | No |

### Debug

| Route | Methods | Purpose | Auth |
|-------|---------|---------|:---:|
| `/api/debug` | GET | DeBank API debug (calculates position values) | No |

### Proxy Architecture

```
Browser                    Next.js Server              External
──────                     ──────────────              ────────
fetch('/api/debank/tokens') ──> GET handler ──> DeBank Pro API
                                   │
                                   ├── Adds API keys from env/config
                                   ├── Forwards query params
                                   └── Returns JSON response
```

All external API calls go through Next.js route handlers to avoid CORS issues. The proxy routes add API keys server-side so they never reach the browser.

---

## 9. UI Architecture

### Provider Hierarchy

```
<html>
  <body>
    <PortfolioProvider>          Auto-refresh, useDbSync, useAutoBackup
      <AuthProvider>             Session check, WebAuthn gate
        <AppShell>               Sidebar + header + category tabs
          {page content}
          <CommandPalette />     CMD-K modal
          <AddPositionModal />   Global modals
          <AddWalletModal />
        </AppShell>
      </AuthProvider>
    </PortfolioProvider>
  </body>
</html>
```

### AppShell Layout

```
┌───────────────────────────────────────────────────────────┐
│ Header Row 1: Logo │ Updated 5m ago │ Theme │ Eye │ ⟳ │⌘K│
│ Header Row 2: [All] [Crypto] [Equities] [Cash] [Other]   │
├──────────┬────────────────────────────────────────────────┤
│ Sidebar  │                                                │
│          │  Main Content Area                             │
│ Overview │  (page.tsx renders here)                       │
│ Assets   │                                                │
│ Exposure │                                                │
│ Perfs    │                                                │
│ ...      │                                                │
│          │                                                │
│          │                                                │
└──────────┴────────────────────────────────────────────────┘
```

Category tabs use Georgia serif at 28px. Sidebar navigation is dynamic -- items change based on active category tab.

### Page Routes (28 pages)

**Overview** (`/`):
| Route | Page |
|-------|------|
| `/` | Dashboard overview |
| `/positions` | All positions |
| `/exposure` | Portfolio exposure |
| `/performance` | Performance metrics |
| `/perps` | Perpetual futures |
| `/settings` | App settings |

**Crypto** (`/crypto`):
| Route | Page |
|-------|------|
| `/crypto` | Crypto overview |
| `/crypto/assets` | Crypto assets |
| `/crypto/exposure` | Crypto exposure |
| `/crypto/perps` | Crypto perps |
| `/crypto/wallets` | Wallet management |
| `/crypto/wallets/[id]` | Wallet detail |
| `/crypto/accounts` | Crypto accounts |
| `/crypto/settings` | Crypto settings |

**Equities** (`/equities`):
| Route | Page |
|-------|------|
| `/equities` | Equity overview |
| `/equities/positions` | Equity positions |
| `/equities/exposure` | Equity exposure |
| `/equities/accounts` | Equity accounts |

**Cash** (`/cash`):
| Route | Page |
|-------|------|
| `/cash` | Cash overview |
| `/cash/positions` | Cash positions |
| `/cash/accounts` | Cash accounts |
| `/cash/currency/[code]` | Currency detail |

**Other** (`/other`):
| Route | Page |
|-------|------|
| `/other` | Other assets overview |
| `/other/positions` | Other positions |

**Shared**:
| Route | Page |
|-------|------|
| `/assets/[symbol]` | Asset detail |
| `/stocks` | Stock view (legacy) |
| `/wallets` | Wallets (legacy) |
| `/wallets/[id]` | Wallet detail (legacy) |

### Sidebar Navigation per Category

| Category | Nav Items |
|----------|-----------|
| **Overview** (All) | Overview, Assets, Exposure, Performance |
| **Crypto** | Overview, Assets, Exposure, Perps, Wallets, Accounts |
| **Equities** | Overview, Assets, Exposure, Accounts |
| **Cash** | Overview, Assets, Accounts |
| **Other** | Overview, Assets |

### CMD-K Architecture

```
User types command
  │
  ▼
useCommandPalette.submitText(input)
  │
  ├── getOrRefreshToken()  (ensure valid session)
  │
  ▼
POST /api/chat { text, ollamaUrl, ollamaModel }
  │
  ├── Phase 1: classifyIntent(text)
  │   └── Local regex/keyword matching -> intent type
  │       (query, mutation, navigation, greeting, ...)
  │
  ├── Phase 2: Filter tools by intent
  │   └── Select 1-3 relevant tools from registry
  │
  ├── Phase 3: Build system prompt
  │   └── Include portfolio context (skip for mutations)
  │
  └── Phase 4: Ollama tool-call loop (max 5 rounds)
      │
      ├── LLM generates tool calls
      ├── For each tool call:
      │   ├── Confirmable mutation? -> return pendingAction
      │   └── Else: execute tool -> add result to history
      └── No more tool calls -> return final response
  │
  ▼
Response: { response, toolCalls[], mutations, pendingAction? }
  │
  ├── Navigation? -> router.push(path)
  ├── pendingAction? -> open ConfirmPositionActionModal
  ├── Mutations executed? -> show success
  └── Query result? -> display in palette
```

---

## 10. Authentication Flow

```
App loads
  │
  ▼
Zustand auth store hydrates from localStorage
  │
  ├── Session expired? (> 30 days since loginTimestamp)
  │   └── YES -> auto-logout, clear state
  │
  ▼
AuthProvider renders
  │
  ├── Not hydrated? -> Loading spinner
  │
  ├── Hydrated, check passkey
  │   │
  │   ├── No passkey registered?
  │   │   └── Auto-authenticate (first-time / passkey-free setup)
  │   │       └── POST /api/auth/token -> store in localStorage
  │   │
  │   └── Passkey registered?
  │       │
  │       ├── Session still valid (< 30 days)?
  │       │   └── Authenticated -> render app
  │       │
  │       └── Session expired?
  │           └── Show LoginScreen -> WebAuthn challenge
  │               └── Success -> POST /api/auth/token -> render app
  │
  ▼
Authenticated: render <AppShell>{children}</AppShell>
```

### Token System

- **Format**: `<timestamp>.<base64url-hmac-sha256-signature>`
- **Secret**: Hardcoded `'billionorzero-local-session'` (local-only app)
- **Expiry**: 30 days
- **Validation**: HMAC signature check + timestamp expiry
- **Storage**: `localStorage` key `'api-session-token'`
- **Protected routes**: All `/api/portfolio/*` and `/api/chat` endpoints check `Authorization: Bearer <token>`

---

## 11. Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useCommandPalette` | `src/hooks/useCommandPalette.ts` | CMD-K state, LLM submission, mutation confirmation flow |
| `useCommandHistory` | `src/hooks/useCommandHistory.ts` | Persist last 10 commands in localStorage, display last 5 |
| `useAutoBackup` | `src/hooks/useAutoBackup.ts` | 5-second debounced backup to `/api/backup` on store changes |
| `useDbSync` | `src/hooks/useDbSync.ts` | 2-second debounced sync to `/api/portfolio/sync` for CMD-K |
| `useRefresh` | `src/components/PortfolioProvider.tsx` | Manual portfolio refresh trigger, shared lock to prevent concurrent refreshes |

---

## 12. File Map

```
src/
├── app/                         Next.js App Router
│   ├── api/                     33 API route handlers
│   │   ├── auth/token/          Session token generation/revocation
│   │   ├── backup/              Backup management (create, list, retrieve)
│   │   ├── cex/binance/         Binance API proxy (public + authenticated)
│   │   ├── chat/                CMD-K Ollama integration
│   │   ├── db/                  Direct db.json read/write
│   │   ├── debank/              DeBank token + protocol proxies
│   │   ├── debug/               DeBank debug endpoint
│   │   ├── perps/               Perp exchange proxies (Hyperliquid, Lighter, Ethereal)
│   │   ├── portfolio/           REST API for CMD-K
│   │   │   ├── accounts/        Account CRUD + sync
│   │   │   ├── debt/            Debt summary
│   │   │   ├── exposure/        Exposure metrics
│   │   │   ├── fx/              FX rates
│   │   │   ├── performance/     Sharpe, CAGR, drawdown
│   │   │   ├── perps/           Perp statistics
│   │   │   ├── positions/       Position CRUD + bulk + sell
│   │   │   ├── prices/          Price data + custom overrides
│   │   │   ├── risk/            Risk profile
│   │   │   ├── settings/        App settings
│   │   │   ├── snapshots/       Net worth snapshots
│   │   │   ├── summary/         Portfolio summary
│   │   │   ├── sync/            Client state -> db.json sync
│   │   │   └── transactions/    Transaction history
│   │   └── solana/              Helius + Birdeye proxies
│   │
│   ├── assets/[symbol]/         Asset detail page
│   ├── cash/                    Cash section (overview, positions, accounts, currency/[code])
│   ├── crypto/                  Crypto section (overview, assets, exposure, perps, wallets, accounts, settings)
│   ├── equities/                Equities section (overview, positions, exposure, accounts)
│   ├── exposure/                Portfolio-wide exposure
│   ├── other/                   Other assets (overview, positions)
│   ├── performance/             Performance metrics
│   ├── perps/                   Perps view
│   ├── positions/               All positions
│   ├── settings/                App settings
│   ├── stocks/                  Legacy stock view
│   ├── wallets/                 Legacy wallet views
│   ├── layout.tsx               Root layout with provider hierarchy
│   ├── page.tsx                 Dashboard overview
│   └── globals.css              Design tokens, theme variables
│
├── components/
│   ├── AppShell.tsx             Main layout: sidebar + header + category tabs
│   ├── AuthProvider.tsx         Auth gate, WebAuthn, session check
│   ├── CommandPalette.tsx       CMD-K modal (cmdk library)
│   ├── PortfolioProvider.tsx    Refresh orchestration, useDbSync, useAutoBackup
│   ├── CategoryView.tsx         Reusable category view
│   ├── Header.tsx               App header
│   ├── LoginScreen.tsx          WebAuthn login UI
│   ├── ConfirmPositionActionModal.tsx  CMD-K mutation confirmation
│   ├── charts/                  Recharts visualizations (NetWorthChart, DonutChart, etc.)
│   ├── modals/                  Modal dialogs (AddWallet, AddPosition, CustomPrice)
│   └── ui/                      Primitives (SearchInput, EmptyState, Tooltip, etc.)
│
├── hooks/
│   ├── useCommandPalette.ts     CMD-K state and submission
│   ├── useCommandHistory.ts     Command history persistence
│   ├── useAutoBackup.ts         Debounced auto-backup
│   └── useDbSync.ts             Debounced db.json sync
│
├── lib/
│   ├── utils.ts                 Formatting (currency, percent, numbers, colors)
│   ├── currencies.ts            36 fiat currencies (single source of truth)
│   ├── api-token.ts             Client-side token helpers
│   └── session-store.ts         Server-side HMAC token generation/validation
│
├── services/
│   ├── portfolio-service.ts     Main orchestrator (coordinates all providers)
│   ├── api/                     Pure HTTP clients (CoinGecko, DeBank, Finnhub, etc.)
│   ├── providers/               Data providers with fallback/caching
│   ├── domain/                  Pure business logic (calculator, categories, metrics, CMD-K)
│   ├── config/                  ConfigManager singleton (API keys from localStorage)
│   └── utils/                   localStorage TTL cache
│
├── store/
│   ├── portfolioStore.ts        Central state: positions, accounts, prices, snapshots (v13)
│   ├── authStore.ts             Auth: session, passkey, 30-day expiry
│   └── themeStore.ts            Theme: light/dark/system
│
└── types/
    └── index.ts                 All domain types, enums, helper functions

data/
└── db.json                      Server-side mirror of portfolioStore (for CMD-K)

portfolio-backup-11022026.json   Canonical DB backup (688 positions, 34 accounts)
```
