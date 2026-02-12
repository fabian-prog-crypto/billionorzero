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

Unit tests use Vitest (`npx vitest run`). E2E tests use Playwright (`npx playwright test`). See the **Testing** section below for details.

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

## Account Types & Asset Classes

Account type (how you connect) and asset class (what you hold) are **orthogonal concepts**. An account connects to a data source; the assets inside it have their own classification.

### Account types

| Account type | Connection | Data source | How positions sync |
|---|---|---|---|
| **Crypto Wallet** | `WalletConnection` | `debank`, `helius` | Auto-synced from on-chain data |
| **CEX Account** | `CexConnection` | `binance`, `coinbase`, `kraken`, `okx` | Auto-synced via exchange API |
| **Brokerage Account** | `ManualConnection` | `manual` | Manually entered |
| **Bank Account** | `ManualConnection` | `manual` | Manually entered |

### What each account type can hold

| Account type | Crypto | Equities (stocks/ETFs) | Cash (fiat & stablecoins) |
|---|:---:|:---:|:---:|
| **Crypto Wallet** | Yes | — | Yes (stablecoins) |
| **CEX Account** | Yes | — | Yes (stablecoins) |
| **Brokerage Account** | — | Yes | Yes (cash balance) |
| **Bank Account** | — | — | Yes |

### Key rules

- A **bank account** holds only cash (fiat currencies like USD, EUR, CHF).
- A **brokerage account** holds equities and cash, never crypto.
- A **crypto wallet** primarily holds crypto but can also hold stablecoins (classified as cash) and tokenized equities.
- A **CEX account** holds crypto and stablecoins, similar to a wallet but synced via exchange API.
- The `AssetClass` on each `Position` (`'crypto' | 'equity' | 'cash' | 'other'`) is independent of the account it sits in.

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
| `portfolioStore` | `portfolio-storage` (v13) | Positions, wallets, CEX accounts, prices, custom prices, FX rates, snapshots, UI state, settings |
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

### ESLint
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Run with `npm run lint`

## Design Language & Style Guide

**Every new feature and UI change must follow this guide.** The app uses a minimal, data-dense financial dashboard aesthetic with sharp edges, muted neutrals, and restrained color. Reference `src/app/globals.css` as the single source of truth for design tokens.

### Visual identity

- **Sharp edges everywhere.** No `rounded-*` classes, no `border-radius`. Cards, buttons, inputs, tags, modals, tooltips -- all have square corners.
- **No gradients.** Background fills are flat solid colors.
- **Minimal chrome.** Thin 1px borders, subtle hover transitions (0.15s ease), no shadows except modals and tooltips which use restrained `box-shadow`.
- **Data-dense layout.** Compact spacing, small font sizes, uppercase micro-labels. Prioritize information density over whitespace.

### Color system (CSS custom properties)

All colors are referenced via `var(--token)`, never hardcoded hex values in components. Both dark (default) and light themes are defined in `globals.css`.

| Token | Dark value | Purpose |
|-------|-----------|---------|
| `--background` | `#141414` | Page background |
| `--background-secondary` | `#1C1C1C` | Slightly elevated surfaces |
| `--background-tertiary` | `#242424` | Buttons, tags, input backgrounds |
| `--foreground` | `#E5E5E5` | Primary text |
| `--foreground-muted` | `#858585` | Secondary/label text |
| `--foreground-subtle` | `#5C5C5C` | Placeholders, disabled text |
| `--card-bg` | `#1C1C1C` | Card backgrounds |
| `--card-border` | `#2C2C2C` | Card borders |
| `--card-hover` | `#242424` | Card hover state |
| `--sidebar-bg` | `#181818` | Sidebar background |
| `--accent-primary` | `#4A7C59` | Primary actions, active states (muted green) |
| `--accent-secondary` | `#5E9E6E` | Hover state for primary actions |
| `--accent-glow` | `rgba(74,124,89,0.12)` | Active nav item background |
| `--positive` | `#7CB98B` | Gains, success |
| `--positive-light` | `rgba(124,185,139,0.1)` | Positive badge background |
| `--negative` | `#C97B7B` | Losses, errors, debt |
| `--negative-light` | `rgba(201,123,123,0.1)` | Negative badge background |
| `--warning` | `#C9B07B` | Warnings, caution |
| `--border` | `#2C2C2C` | Standard borders |
| `--border-light` | `#3C3C3C` | Hover borders |
| `--tag-bg` | `#242424` | Tag backgrounds |
| `--tag-text` | `#858585` | Tag text |

### Typography

| Context | Font | Size | Weight | Extra |
|---------|------|------|--------|-------|
| **Body** | Inter / system sans-serif | 16px base | 400 | `letter-spacing: -0.01em`, `line-height: 1.6` |
| **Logo / category tabs** | Georgia, serif | 28px (tabs), base (logo) | 400-500 | Serif font for brand identity |
| **Metric labels** | Inherited | **10px** | 500 | `uppercase`, `letter-spacing: 0.06em`, color `--foreground-muted` |
| **Metric values** | Inherited | **20-21px** (`text-xl`) | 600 (semibold) | |
| **Large stat values** | Inherited | 32px / 48px | 600 | `letter-spacing: -0.02em` |
| **Hero net worth** | Inherited | 30px (`text-3xl`) | 600 | |
| **Section headers** | Inherited | 15px | 500 (medium) | e.g., "Asset Allocation", "Risk Metrics" |
| **Table headers** | Inherited | 13px | 500 | `uppercase`, `letter-spacing: 0.06em` |
| **Buttons** | Inherited | 13px | 500 | |
| **Tags** | Inherited | 13px | 500 | `uppercase`, `letter-spacing: 0.02em` |
| **Nav items** | Inherited | 13px | 500 | |
| **Chart legends** | Inherited | 12px | 400/500 | |
| **Tooltips** | Inherited | 10px | 400 | |
| **Muted secondary text** | Inherited | 13-14px | 400 | color `--foreground-muted` |
| **"% of assets" helper** | Inherited | 12px (`text-xs`) | 400 | color `--foreground-muted` |

### Spacing patterns

| Context | Value |
|---------|-------|
| **Page padding** | `px-6 lg:px-8 py-6` (main content area) |
| **Section vertical gap** | `space-y-8` between major sections |
| **Section dividers** | `<hr className="border-[var(--border)]" />` between sections |
| **Grid gaps** | `gap-6` for metric grids, `gap-8` for chart grids |
| **Card padding** | 24px (desktop), 16px (mobile) |
| **Modal padding** | 28px (desktop), 20px (mobile) |
| **Label-to-value gap** | `mb-1` to `mb-2` |
| **Section header to content** | `mb-4` |

### Component patterns

**Metric label + value** (the most repeated pattern):
```tsx
<p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">LABEL</p>
<p className="text-xl font-semibold">{value}</p>
<p className="text-xs text-[var(--foreground-muted)]">helper text</p>
```

**Metric grids**: `grid grid-cols-2 md:grid-cols-4 gap-6` or `md:grid-cols-5` depending on item count.

**Section pattern**:
```tsx
<div>
  <h3 className="font-medium mb-4">Section Title</h3>
  <div className="grid ...">
    {/* metric cards */}
  </div>
</div>
```

**Change badges** (gain/loss pill):
```tsx
<div className={`flex items-center gap-1.5 px-3 py-1.5 ${
  value >= 0 ? 'bg-[var(--positive-light)]' : 'bg-[var(--negative-light)]'
}`}>
  <TrendingUp className="w-4 h-4 text-[var(--positive)]" />
  <span className={getChangeColor(value) + ' font-semibold'}>{formatPercent(value)}</span>
</div>
```

**Buttons** (use CSS classes from `globals.css`):
- `.btn.btn-primary` -- Green accent, white text. Primary actions (Add Position, Save).
- `.btn.btn-secondary` -- Tertiary bg, bordered. Secondary actions.
- `.btn-ghost` -- Transparent, muted text. Icon-only header buttons (`p-1.5`).
- `.btn-danger` -- Red bg, white text. Destructive actions.
- All buttons: `font-size: 13px`, `font-weight: 500`, `padding: 6px 12px`, square corners.

**Cards**: Use `.card` class (1px border, 24px padding, no radius). Hover lightens border to `--border-light`.

**Modals**: `.modal-backdrop` (blurred overlay) + `.modal-content` (card bg, 28px padding, `max-width: 480px`).

**Tables**: `.table-header` for column headers (13px uppercase muted). `.hover-row` for row hover effect.

**Tabs**: Category tabs use Georgia serif at 28px. Active tab gets `font-weight: 500` + 1.5px bottom underline in `--foreground`. Inactive tabs are `#B5B5B5`.

**Empty states**: Use the `EmptyState` component with icon, title (15px semibold), description (13px muted), optional action.

### Icons

- **Library**: Lucide React exclusively. Never use other icon libraries.
- **Standard size**: `w-4 h-4` for most inline/button icons.
- **Empty state icons**: `w-5 h-5` to `w-6 h-6` inside a container.
- **Color**: Inherit from parent text color, or explicitly `text-[var(--foreground-muted)]`.

### Formatting functions (use these, don't re-implement)

All in `src/lib/utils.ts`:
- `formatCurrency(value)` -- Handles negative, sub-penny, sub-dollar, and $10+ formatting.
- `formatPercent(value)` -- Always prefixes `+` or `-`, e.g., `+2.50%`.
- `formatNumber(value, decimals)` -- Locale-formatted with commas.
- `getChangeColor(value)` -- Returns `text-positive`, `text-negative`, or muted.
- `cn(...classes)` -- Simple class name joiner (truthy filter).

### Responsive breakpoints

| Breakpoint | Usage |
|------------|-------|
| Default (mobile) | Single column grids, compact padding |
| `md` (768px) | Multi-column metric grids (`grid-cols-4`, `grid-cols-5`) |
| `lg` (1024px) | Sidebar visible, wider page padding (`px-8`), flex row layouts |

### Rules for new features

1. **Use CSS custom properties** for all colors. Never hardcode hex in components.
2. **Keep edges sharp.** No `rounded-*` anywhere.
3. **Follow the metric label pattern** (10px uppercase muted label, xl semibold value, xs muted helper).
4. **Use existing CSS classes** (`.btn`, `.card`, `.tag`, `.table-header`, `.metric-card`) before writing inline styles.
5. **Use Lucide React** for icons. Match the `w-4 h-4` standard size.
6. **Use formatting functions** from `@/lib/utils` -- never format currency/percentages manually.
7. **Match existing spacing** -- `space-y-8` between sections, `gap-6` in grids, `mb-4` after section headers.
8. **Separate sections with `<hr>`** using `border-[var(--border)]`.
9. **Support `hideBalances`** -- any new value display must check this flag and show `'••••'` when true.
10. **Transitions are 0.15s ease.** Do not use longer or flashier animations.

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

## Testing

### Commands

```bash
npx playwright test                        # Run all E2E tests
npx playwright test e2e/command-palette    # Run CMD-K tests only
npx playwright test --headed               # Run with visible browser
npx playwright show-report                 # View last HTML report
npx vitest run                             # Run all unit/integration tests
```

### E2E and unit test patterns

See `.claude/rules/testing.md` for comprehensive test patterns, E2E seed data rules (v13 format, `seedApiToken()`, `seededPage` fixture), and store migration guidance.

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
4. Consider migration if changing the persisted schema shape (current version: 13). See `.claude/rules/testing.md` for migration guidance.

## Pre-Merge QA

See `.claude/rules/qa.md` for the mandatory portfolio diff check procedure and `.claude/rules/qa-acceptance.md` for the feature acceptance criteria checklist.

## Existing Documentation

- `docs/SERVICE_ARCHITECTURE.md` -- Detailed architecture diagrams and data flows
- `ARCHITECTURE_IMPROVEMENTS.md` -- 12 planned improvements
- `PLAN_UI_REDESIGN.md` -- UI redesign specifications
- `architecture-diagrams.mermaid` -- Mermaid-format architecture diagrams
