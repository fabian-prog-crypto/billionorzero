# Service Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   UI LAYER                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Overview   │  │   Exposure   │  │    Perps     │  │   Assets     │         │
│  │    Page      │  │    Page      │  │    Page      │  │    Page      │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ZUSTAND STORES                                      │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐         │
│  │       portfolioStore           │  │         authStore              │         │
│  │  • positions[]                 │  │  • isAuthenticated             │         │
│  │  • wallets[]                   │  │  • isPasskeyEnabled            │         │
│  │  • prices{}                    │  └────────────────────────────────┘         │
│  │  • customPrices{}              │                                             │
│  │  • snapshots[]                 │                                             │
│  └────────────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                                          │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                      PortfolioService (Orchestrator)                      │   │
│  │  • refreshPortfolio(positions, wallets)                                   │   │
│  │  • Coordinates all providers and domain services                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                           │
│         ┌────────────────────────────┼────────────────────────────┐             │
│         ▼                            ▼                            ▼             │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐      │
│  │  PriceProvider  │    │   WalletProvider    │    │    CEXProvider      │      │
│  │    (Facade)     │    │                     │    │                     │      │
│  └────────┬────────┘    └──────────┬──────────┘    └─────────────────────┘      │
│           │                        │                                             │
│     ┌─────┴─────┐           ┌──────┴──────┐                                     │
│     ▼           ▼           ▼             ▼                                     │
│ ┌────────┐ ┌────────┐  ┌────────┐  ┌─────────────────┐                          │
│ │ Crypto │ │ Stock  │  │ DeBank │  │ PerpExchange    │                          │
│ │ Price  │ │ Price  │  │  API   │  │    Service      │                          │
│ │Service │ │Service │  └────────┘  └────────┬────────┘                          │
│ └────────┘ └────────┘              ┌────────┼────────┐                          │
│                                    ▼        ▼        ▼                          │
│                              ┌────────┐┌────────┐┌────────┐                     │
│                              │Hyper-  ││Lighter ││Ethereal│                     │
│                              │liquid  ││Provider││Provider│                     │
│                              │Provider││        ││        │                     │
│                              └────────┘└────────┘└────────┘                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            DOMAIN LAYER (Pure Logic)                             │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        PortfolioCalculator                                  │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ classifyAssetExposure() - Single source of truth for classification │   │ │
│  │  │                                                                      │   │ │
│  │  │  Classifications:                                                    │   │ │
│  │  │  • perp-long      → Perp long positions                             │   │ │
│  │  │  • perp-short     → Perp short positions                            │   │ │
│  │  │  • perp-margin    → Stablecoin margin on perp exchanges             │   │ │
│  │  │  • perp-spot      → Spot holdings on perp exchanges                 │   │ │
│  │  │  • spot-long      → Regular crypto/stock long positions             │   │ │
│  │  │  • spot-short     → Borrowed CRYPTO (actual short exposure)         │   │ │
│  │  │  • cash           → Stablecoins, Pendle PTs                         │   │ │
│  │  │  • borrowed-cash  → Borrowed stablecoins (leverage, NOT short)      │   │ │
│  │  └─────────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                             │ │
│  │  • calculateExposureData()     → Full exposure metrics                      │ │
│  │  • calculatePortfolioSummary() → Portfolio overview                         │ │
│  │  • calculatePositionValue()    → Single position valuation                  │ │
│  │  • detectPerpTrade()           → Identify Long/Short positions              │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐               │
│  │      CategoryService        │  │      SnapshotManager        │               │
│  │                             │  │                             │               │
│  │  Main Categories:           │  │  • createDailySnapshot()    │               │
│  │  • crypto                   │  │  • getSnapshotsByPeriod()   │               │
│  │  • stocks                   │  │  • calculatePerformance()   │               │
│  │  • equity                   │  │                             │               │
│  │  • cash                     │  └─────────────────────────────┘               │
│  │  • other                    │                                                │
│  │                             │                                                │
│  │  Crypto Sub-categories:     │                                                │
│  │  • btc, eth, sol            │                                                │
│  │  • stablecoins, tokens      │                                                │
│  │  • perps                    │                                                │
│  └─────────────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER (HTTP Clients)                            │
│                                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │  CoinGecko  │ │   DeBank    │ │   Finnhub   │ │ Hyperliquid │ │  Lighter   │ │
│  │    API      │ │    API      │ │    API      │ │    API      │ │   API      │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│                                                                   ┌────────────┐ │
│                                                                   │  Ethereal  │ │
│                                                                   │    API     │ │
│                                                                   └────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Portfolio Refresh

```
┌──────────────────┐
│  User triggers   │
│    refresh       │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    PortfolioService.refreshPortfolio()                    │
└──────────────────────────────────────────────────────────────────────────┘
         │
         ├───────────────────────────────────────────┐
         │                                           │
         ▼                                           ▼
┌─────────────────────────────┐          ┌─────────────────────────────┐
│     WalletProvider          │          │      PriceProvider          │
│  fetchAllWalletPositions()  │          │  getPricesForPositions()    │
└──────────────┬──────────────┘          └──────────────┬──────────────┘
               │                                        │
    ┌──────────┼──────────┐                   ┌─────────┴─────────┐
    │          │          │                   │                   │
    ▼          ▼          ▼                   ▼                   ▼
┌────────┐ ┌────────┐ ┌──────────────┐  ┌──────────┐       ┌──────────┐
│ DeBank │ │ DeBank │ │PerpExchange  │  │CoinGecko │       │ Finnhub  │
│ Tokens │ │Protocols│ │  Service    │  │  Crypto  │       │  Stocks  │
└────────┘ └────────┘ └──────┬───────┘  └──────────┘       └──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │Hyperliquid│  │ Lighter  │  │ Ethereal │
        │ Provider │  │ Provider │  │ Provider │
        └──────────┘  └──────────┘  └──────────┘
               │              │              │
               └──────────────┴──────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Merge All Results                                 │
│  • Wallet positions (with DeBank prices)                                 │
│  • Perp positions (with exchange prices)                                 │
│  • Manual position prices (CoinGecko/Finnhub)                            │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Update Zustand Store                                 │
│  • setPrices(allPrices)                                                  │
│  • setWalletPositions(walletPositions)                                   │
│  • setLastRefresh(timestamp)                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Exposure Calculation

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Component requests exposure data                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│            calculateAllPositionsWithPrices(positions, prices, customPrices)      │
│                                                                                  │
│  For each position:                                                              │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  1. Check customPrices[symbol] first (user override)                       │ │
│  │  2. Fall back to prices[debankPriceKey] (wallet tokens)                    │ │
│  │  3. Fall back to prices[coinGeckoId] (manual crypto)                       │ │
│  │  4. Calculate value = amount × price (negative if isDebt)                  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       calculateExposureData(assetsWithPrice)                     │
│                                                                                  │
│  SINGLE PASS through all assets:                                                 │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  For each asset:                                                           │ │
│  │    1. classifyAssetExposure(asset) → classification                        │ │
│  │    2. Update exposure metrics based on classification:                     │ │
│  │       • perp-long    → perpsLongs += value                                 │ │
│  │       • perp-short   → perpsShorts += value                                │ │
│  │       • perp-margin  → perpsMargin += value, cashEquivalents += value      │ │
│  │       • spot-long    → spotLongValue += value                              │ │
│  │       • spot-short   → spotShortValue += value (actual short exposure)     │ │
│  │       • cash         → spotLongValue += value, cashEquivalents += value    │ │
│  │       • borrowed-cash→ (debt tracked, but NOT short exposure)              │ │
│  │    3. Update category breakdown (categoryAssets/categoryDebts)             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Calculate Final Metrics                             │
│                                                                                  │
│  Exposure Metrics:                                                               │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  longExposure  = (spotLong - cashEquivalents) + perpsLongs                 │ │
│  │  shortExposure = spotShort + perpsShorts                                   │ │
│  │  grossExposure = longExposure + shortExposure                              │ │
│  │  netExposure   = longExposure - shortExposure                              │ │
│  │  leverage      = grossExposure / netWorth                                  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Returns ExposureData:                                                           │
│  • categories[]        - Hierarchical breakdown                                  │
│  • perpsBreakdown      - margin, longs, shorts                                  │
│  • exposureMetrics     - L/S, gross, net, leverage                              │
│  • concentrationMetrics - top positions, HHI                                    │
│  • spotDerivatives     - spot vs derivatives breakdown                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Classification Logic

```
                            ┌─────────────────┐
                            │  Input: Asset   │
                            │  (with price)   │
                            └────────┬────────┘
                                     │
                                     ▼
                        ┌────────────────────────┐
                        │ Is on perp exchange?   │
                        │ (Hyperliquid/Lighter/  │
                        │  Ethereal)             │
                        └────────────┬───────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │ YES                             │ NO
                    ▼                                 ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │ Is perp trade?        │         │ Is stablecoin/PT?     │
        │ (name has Long/Short) │         └───────────┬───────────┘
        └───────────┬───────────┘                     │
                    │                     ┌───────────┴───────────┐
         ┌──────────┴──────────┐          │ YES                   │ NO
         │ YES                 │ NO       ▼                       ▼
         ▼                     ▼    ┌───────────┐         ┌───────────────┐
   ┌───────────┐      ┌─────────────┐│ Is debt? │         │   Is debt?    │
   │ Is Short? │      │Is stablecoin?│└─────┬────┘         └───────┬───────┘
   └─────┬─────┘      └──────┬──────┘      │                       │
         │                   │        ┌────┴────┐             ┌────┴────┐
    ┌────┴────┐         ┌────┴────┐   │YES     │NO            │YES     │NO
    │YES  │NO │         │YES  │NO │   ▼        ▼              ▼        ▼
    ▼     ▼   │         ▼     ▼   │ ┌──────┐ ┌──────┐    ┌─────────┐ ┌──────┐
┌──────┐┌────┐│    ┌───────┐┌────┐│ │borrow│ │ cash │    │spot-    │ │spot- │
│perp- ││perp││    │perp-  ││perp││ │-cash │ │      │    │short    │ │long  │
│short ││long││    │margin ││spot││ └──────┘ └──────┘    └─────────┘ └──────┘
└──────┘└────┘│    └───────┘└────┘│
              │                   │
              └───────────────────┘
```

## File Structure

```
src/services/
├── index.ts                           # Main exports
├── portfolio-service.ts               # Orchestrator
│
├── api/                               # Pure HTTP clients
│   ├── index.ts
│   ├── types.ts
│   ├── coingecko-api.ts              # Crypto prices
│   ├── debank-api.ts                 # Wallet data
│   ├── stock-api.ts                  # Stock prices (Finnhub)
│   ├── hyperliquid-api.ts            # Hyperliquid perps
│   ├── lighter-api.ts                # Lighter perps
│   └── ethereal-api.ts               # Ethereal perps
│
├── providers/                         # Data providers with caching
│   ├── index.ts
│   ├── price-provider.ts             # Unified price facade
│   ├── crypto-price-service.ts       # CoinGecko + mappings
│   ├── stock-price-service.ts        # Finnhub + fallbacks
│   ├── wallet-provider.ts            # DeBank + perps
│   ├── hyperliquid-provider.ts       # Hyperliquid positions
│   ├── lighter-provider.ts           # Lighter positions
│   ├── ethereal-provider.ts          # Ethereal positions
│   ├── cex-provider.ts               # Binance CEX
│   └── demo-data.ts                  # Fallback data
│
├── domain/                            # Pure business logic
│   ├── index.ts
│   ├── portfolio-calculator.ts       # ★ Core calculations
│   ├── category-service.ts           # ★ Asset classification
│   ├── perp-exchange-service.ts      # Exchange registry
│   └── snapshot-manager.ts           # Daily snapshots
│
├── config/
│   ├── index.ts
│   └── service-config.ts             # API keys, settings
│
└── utils/
    ├── index.ts
    └── cache.ts                       # TTL-based cache
```
