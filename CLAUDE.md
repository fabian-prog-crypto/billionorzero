# CLAUDE.md - AI Assistant Guide for Billion or Zero

## Project Overview

**Billion or Zero** is a full-stack portfolio management web application for tracking cryptocurrency, stocks, and manual assets with real-time pricing, performance metrics, and exposure analysis. It is a client-side-first app with no traditional database -- all data persists in the browser's localStorage.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.4 (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19.2.3 |
| Styling | Tailwind CSS 4, CSS custom properties for theming |
| State | Zustand 5.0.10 with localStorage persistence |
| Charts | Recharts 3.7.0 |
| Icons | Lucide React |
| Dates | date-fns 4.1.0 |
| IDs | uuid 13.0.0 |
| Fonts | Geist, Geist Mono, Poppins (via next/font) |

## Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint (Next.js core-web-vitals + TypeScript rules)
```

There is no test framework configured. No `npm test` command exists.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # Backend API route handlers (proxy endpoints)
│   │   ├── debank/         # DeBank wallet data proxy
│   │   ├── solana/         # Solana token endpoints (Helius, Birdeye)
│   │   ├── perps/          # Perpetual exchange endpoints
│   │   ├── cex/            # Centralized exchange endpoints (Binance)
│   │   └── debug/          # Debug/diagnostic endpoints
│   ├── crypto/             # Crypto portfolio views (expose, perps, wallets, assets, accounts, settings)
│   ├── stocks/             # Stock portfolio view
│   ├── equities/           # Equity positions view
│   ├── cash/               # Cash holdings view
│   ├── exposure/           # Portfolio exposure analysis
│   ├── performance/        # Performance metrics and charts
│   ├── perps/              # Perpetual futures view
│   ├── positions/          # All positions unified view
│   ├── assets/             # Individual asset detail pages
│   ├── wallets/            # Wallet management pages
│   ├── settings/           # App settings
│   ├── other/              # Other asset types
│   ├── page.tsx            # Dashboard/Overview (home page)
│   ├── layout.tsx          # Root layout with providers
│   └── globals.css         # Global styles and CSS variables
│
├── services/               # Business logic layer (layered architecture)
│   ├── api/                # Pure HTTP clients -- no business logic here
│   │   ├── coingecko-api.ts
│   │   ├── debank-api.ts
│   │   ├── stock-api.ts      (Finnhub)
│   │   ├── helius-api.ts
│   │   ├── birdeye-api.ts
│   │   ├── ethereal-api.ts
│   │   ├── hyperliquid-api.ts
│   │   ├── lighter-api.ts
│   │   ├── fx-api.ts
│   │   └── types.ts
│   │
│   ├── providers/          # Data providers with fallback/caching
│   │   ├── wallet-provider.ts       # DeBank + Solana wallet data
│   │   ├── price-provider.ts        # Unified price facade
│   │   ├── crypto-price-service.ts  # CoinGecko crypto pricing
│   │   ├── stock-price-service.ts   # Finnhub stock pricing
│   │   ├── stock-logo-service.ts    # Stock logo/info
│   │   ├── cex-provider.ts          # CEX account data (Binance)
│   │   ├── hyperliquid-provider.ts
│   │   ├── lighter-provider.ts
│   │   ├── ethereal-provider.ts
│   │   └── demo-data.ts             # Demo mode synthetic data
│   │
│   ├── domain/             # Pure business logic (no external dependencies)
│   │   ├── portfolio-calculator.ts  # Core portfolio calculations & classification
│   │   ├── category-service.ts      # Asset categorization (crypto, stocks, equity, cash, other)
│   │   ├── perp-exchange-service.ts # Perp exchange registry/metadata
│   │   ├── snapshot-manager.ts      # Daily net worth snapshots
│   │   └── performance-metrics.ts   # Sharpe ratio, CAGR, drawdown calculations
│   │
│   ├── config/
│   │   └── service-config.ts   # ConfigManager singleton (API keys from localStorage)
│   │
│   ├── utils/
│   │   └── cache.ts            # localStorage TTL cache (5-min default)
│   │
│   └── portfolio-service.ts    # Main orchestrator (coordinates all providers)
│
├── components/             # React components
│   ├── AppShell.tsx        # Main layout with sidebar navigation
│   ├── Header.tsx          # App header
│   ├── LoginScreen.tsx     # Authentication UI
│   ├── AuthProvider.tsx    # Auth state provider
│   ├── PortfolioProvider.tsx # Portfolio sync & auto-refresh
│   ├── CategoryView.tsx    # Reusable category view component
│   ├── modals/             # Modal dialogs
│   │   ├── AddWalletModal.tsx
│   │   ├── AddPositionModal.tsx
│   │   └── CustomPriceModal.tsx
│   ├── charts/             # Recharts-based visualizations
│   │   ├── NetWorthChart.tsx
│   │   ├── DonutChart.tsx
│   │   ├── AllocationChart.tsx
│   │   └── ExposureChart.tsx
│   └── ui/                 # Basic UI primitives
│       ├── SearchInput.tsx
│       ├── ViewModeToggle.tsx
│       ├── EmptyState.tsx
│       ├── Tooltip.tsx
│       ├── Alert.tsx
│       ├── StockIcon.tsx
│       └── CryptoIcon.tsx
│
├── store/                  # Zustand state management
│   ├── portfolioStore.ts   # Positions, wallets, prices, snapshots, settings
│   ├── authStore.ts        # Authentication with 30-day session expiry
│   └── themeStore.ts       # Theme preference (light/dark/system)
│
├── types/
│   └── index.ts            # Core domain types (Position, Wallet, PriceData, etc.)
│
└── lib/
    └── utils.ts            # Formatting helpers (currency, numbers, percent, colors)
```

## Architecture

The project follows a **layered architecture** (ports & adapters style):

```
UI Components  -->  Zustand Stores  -->  PortfolioService (orchestrator)
                                              |
                          +-------------------+-------------------+
                          |                   |                   |
                    PriceProvider       WalletProvider       CEXProvider
                     (facade)
                    /         \              |
            CryptoPrice   StockPrice    DeBank + Solana + Perp Exchanges
            (CoinGecko)   (Finnhub)
```

### Key architectural rules

1. **API layer** (`services/api/`) contains only HTTP clients. No business logic.
2. **Provider layer** (`services/providers/`) handles data fetching with fallback strategies and caching.
3. **Domain layer** (`services/domain/`) contains pure business logic with no external dependencies.
4. **Services use singletons** via factory functions: `getPortfolioService()`, `getWalletProvider()`, `getPriceProvider()`.
5. **All state is client-side.** No server database. Zustand stores persist to localStorage.
6. **API routes** (`app/api/`) are proxy endpoints to avoid CORS -- they forward requests to external services.

### Data flow for portfolio refresh

```
User triggers refresh
  -> PortfolioService.refreshPortfolio()
    -> WalletProvider fetches positions (DeBank, Solana Helius/Birdeye, Perp exchanges)
    -> PriceProvider fetches prices (CoinGecko, Finnhub)
    -> FX rates fetched
    -> Results merged
    -> Zustand store updated (positions, prices, FX rates)
    -> Daily snapshot taken if needed
```

## Core Domain Types

Defined in `src/types/index.ts`:

- **`Position`** -- A single asset holding (crypto, stock, ETF, cash, manual). Can be from wallet, manual entry, or CEX account. Has optional `isDebt`, `protocol`, `detailTypes`, `unlockAt` fields.
- **`Wallet`** -- A blockchain wallet address with chain list and optional perp exchange connections.
- **`CexAccount`** -- Centralized exchange account (Binance, Coinbase, etc.) with API credentials.
- **`PriceData`** -- Price info with 24h change data.
- **`AssetWithPrice`** -- Position enriched with current price, value, and allocation percentage.
- **`NetWorthSnapshot`** -- Daily snapshot for performance tracking.
- **`PortfolioSummary`** -- Aggregated portfolio overview with totals by asset type.

### Asset types: `'crypto' | 'stock' | 'etf' | 'cash' | 'manual'`
### Perp exchanges: `'hyperliquid' | 'lighter' | 'ethereal'`
### CEX exchanges: `'binance' | 'coinbase' | 'kraken' | 'okx'`

## Asset Classification System

The classification logic in `portfolio-calculator.ts` (`classifyAssetExposure()`) is the single source of truth for how assets are categorized for exposure calculations:

- **`perp-long`** / **`perp-short`** -- Perpetual futures positions
- **`perp-margin`** -- Stablecoin margin on perp exchanges
- **`perp-spot`** -- Spot holdings on perp exchanges
- **`spot-long`** -- Regular crypto/stock long positions
- **`spot-short`** -- Borrowed crypto (actual short exposure)
- **`cash`** -- Stablecoins, Pendle PTs
- **`borrowed-cash`** -- Borrowed stablecoins (leverage, NOT short exposure)

## External API Integrations

| Service | Purpose | Key Required |
|---------|---------|:---:|
| DeBank | Multi-chain wallet data, DeFi positions | Yes |
| Helius | Solana token balances (DAS API) | Yes |
| Birdeye | Solana token data (fallback for Helius) | Yes |
| CoinGecko | Crypto prices, 24h changes | No (free tier) |
| Finnhub | Stock prices and quotes | Yes |
| Hyperliquid | Perp futures positions | No |
| Lighter | Perp futures on Solana | No |
| Ethereal | Cross-chain perpetuals | No |
| Binance | CEX balance aggregation | Optional |
| FX API | Currency conversion rates | No |

API keys are stored in localStorage (not `.env` files) and managed via the Settings page and `ConfigManager` singleton in `services/config/service-config.ts`.

## State Management

Three Zustand stores, all persisted to localStorage:

| Store | Key | Contents |
|-------|-----|----------|
| `portfolioStore` | `portfolio-storage` (v2) | Positions, wallets, CEX accounts, prices, custom prices, FX rates, snapshots, UI state, settings |
| `authStore` | `auth-storage` | Authentication status, passkey flag, login timestamp |
| `themeStore` | `theme-storage` | Theme preference (light/dark/system) |

Store hooks follow the pattern `usePortfolioStore`, `useAuthStore`, `useThemeStore`.

## Coding Conventions

### TypeScript
- **Strict mode** is enabled. Avoid `any` types.
- **Path alias**: Use `@/` for imports from `src/` (e.g., `import { Position } from '@/types'`).
- **Target**: ES2017.

### Naming
- **Components**: PascalCase files and exports (`AddWalletModal.tsx`)
- **Services/utils**: camelCase files (`portfolio-calculator.ts`)
- **Types/interfaces**: PascalCase (`Position`, `PortfolioSummary`)
- **Store hooks**: `use` prefix (`usePortfolioStore`)
- **Factory functions**: `get` prefix for singletons (`getPortfolioService()`)

### File organization
- One React component per file (modals grouped in `modals/` directory)
- Barrel exports via `index.ts` files in service subdirectories
- Pages use Next.js App Router conventions (`page.tsx`, `layout.tsx`)

### Patterns
- **Singleton services** with factory functions that accept config objects
- **Fallback strategies** in providers (e.g., Helius -> Birdeye for Solana data, demo data when APIs unavailable)
- **Custom `ApiError` class** with status code and service name for error tracking
- **localStorage TTL cache** (5-minute default) to reduce API calls
- **Discriminated unions** for asset types and classifications

### Styling
- Tailwind CSS 4 utility classes
- CSS custom properties in `globals.css` for theming (light/dark mode)
- Three font families available: `--font-geist-sans`, `--font-geist-mono`, `--font-poppins`

### ESLint
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Run with `npm run lint`

## Provider Hierarchy (Root Layout)

```tsx
<PortfolioProvider>      // Auto-refresh, portfolio sync
  <AuthProvider>         // Auth state, session expiry
    <AppShell>           // Sidebar navigation, layout
      {children}         // Page content
    </AppShell>
  </AuthProvider>
</PortfolioProvider>
```

## Caching Strategy

- **localStorage TTL cache** (`services/utils/cache.ts`): 5-minute default, used for wallet/price data
- **Zustand persistence**: Positions, wallets, prices survive page reload
- **CoinGecko rate limiting**: 1-second minimum between requests (free tier)

## Key Files to Know

| File | Why it matters |
|------|---------------|
| `src/services/portfolio-service.ts` | Main orchestrator -- coordinates all data fetching |
| `src/services/domain/portfolio-calculator.ts` | Core calculations, asset classification, exposure metrics |
| `src/services/domain/category-service.ts` | Asset categorization logic |
| `src/store/portfolioStore.ts` | Central state -- all position/price/wallet data |
| `src/types/index.ts` | All domain type definitions |
| `src/components/PortfolioProvider.tsx` | Auto-refresh logic, store hydration |
| `src/app/layout.tsx` | Root layout with provider hierarchy |
| `src/lib/utils.ts` | Currency/number formatting, color helpers |
| `src/services/config/service-config.ts` | API key management |
| `docs/SERVICE_ARCHITECTURE.md` | Detailed architecture diagrams and data flow |

## Common Tasks

### Adding a new page
1. Create `src/app/<route>/page.tsx` using App Router conventions
2. The page automatically gets the `AppShell` layout (sidebar + header)
3. Use `usePortfolioStore` to access portfolio data

### Adding a new API integration
1. Create HTTP client in `src/services/api/<service>-api.ts`
2. Create provider in `src/services/providers/<service>-provider.ts`
3. Wire into `PortfolioService` if it participates in refresh cycle
4. Add proxy API route in `src/app/api/<service>/` if needed for CORS

### Adding a new asset classification
1. Update `classifyAssetExposure()` in `src/services/domain/portfolio-calculator.ts`
2. Update exposure calculation logic in the same file
3. Update `src/services/domain/category-service.ts` if new category needed

### Modifying the Zustand store
1. Add types to the `PortfolioState` interface in `src/store/portfolioStore.ts`
2. Implement the action in the store's `create()` call
3. If adding persistent fields, they auto-persist via Zustand's `persist` middleware
4. Consider migration if changing the persisted schema shape (current version: 2)

## Pre-Merge QA: Portfolio Diff Check (MANDATORY)

Before merging any branch into main, you **must** perform a quantitative portfolio comparison to verify your changes do not silently alter existing portfolio data. This is a hard gate -- do not skip it.

### Procedure

1. **Baseline snapshot (main):** Check out `main`, run the app (`npm run dev`), trigger a full portfolio sync, and record the complete output -- all positions, prices, asset classifications, and calculated values (net worth, exposure metrics, category totals).

2. **Branch snapshot:** Check out your feature branch, run the app, trigger a full portfolio sync with the same wallets/accounts, and record the same data.

3. **Diff the two snapshots.** Compare position-by-position:
   - Position count, symbols, amounts, chains, protocols
   - Prices and 24h change values
   - Calculated values (position value, allocation %)
   - Exposure classifications (`classifyAssetExposure()` outputs)
   - Portfolio summary totals (net worth, gross assets, debts, category breakdowns)

### Decision rules

| Diff result | Action |
|-------------|--------|
| **Existing positions/prices/values changed** | **ABORT the merge.** Investigate why existing data differs. Fix the regression before proceeding. Do not merge until the baseline matches. |
| **Only new/additional positions appear** | **ASK the user** for explicit approval before merging. Explain what new positions were added and why. |
| **No differences** | Safe to merge. |

### Why this matters

This app has no test suite. The portfolio sync pipeline touches multiple external APIs, providers, and classification logic. A small change in any layer (API parsing, provider fallback, classification rules, price resolution order) can silently corrupt portfolio values. This diff check is the primary regression safety net.

## Existing Documentation

- `docs/SERVICE_ARCHITECTURE.md` -- Detailed architecture diagrams and data flows
- `ARCHITECTURE_IMPROVEMENTS.md` -- 12 planned improvements
- `PLAN_UI_REDESIGN.md` -- UI redesign specifications
- `architecture-diagrams.mermaid` -- Mermaid-format architecture diagrams
