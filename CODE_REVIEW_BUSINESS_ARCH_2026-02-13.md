# Code Review 2026-02-13 - Business Documentation vs Architecture and Implementation

## Review Scope
- Repository: `billionorzero`
- Date: 2026-02-13
- Requested focus: business documentation (`*.md`), architecture, implementation, business logic consistency, unused/legacy aspects, robustness recommendations.
- Change policy: documentation only (no code changes).

## Sources Reviewed
- `architecture.md`
- `docs/SERVICE_ARCHITECTURE.md`
- `CLAUDE.md`
- `ARCHITECTURE_IMPROVEMENTS.md`
- Core implementation in `src/store`, `src/services`, `src/components`, and `src/app/api`

## Findings (Prioritized)

### Critical

#### CRIT-01: API key trust boundary in docs is not true in implementation
**Documentation states**
- Proxy routes add keys server-side so keys never reach browser: `architecture.md:665`.

**Implementation does**
- Browser sends provider keys directly in query params/body:
- DeBank client appends `apiKey` in URL: `src/services/api/debank-api.ts:25`, `src/services/api/debank-api.ts:52`.
- Wallet provider sends Helius/Birdeye keys in URL: `src/services/providers/wallet-provider.ts:728`, `src/services/providers/wallet-provider.ts:752`.
- API routes read `apiKey` from query: `src/app/api/debank/tokens/route.ts:8`, `src/app/api/debank/protocols/route.ts:8`, `src/app/api/solana/tokens/route.ts:143`, `src/app/api/solana/birdeye/route.ts:9`.
- Binance proxy receives credentials from browser body: `src/services/providers/cex-provider.ts:85`, `src/app/api/cex/binance/route.ts:78`.

**Business impact**
- Architectural security assumptions are wrong in docs.
- Key exposure risk is higher than documented (URL logs, browser history, telemetry, and debug logs).

**Recommendation**
- Document current behavior explicitly as "client-managed API keys".
- Add a migration plan to true server-side key injection if that is the target architecture.
- At minimum, prohibit key transport in query strings and redact key metadata in logs.

#### CRIT-02: Persistence/source-of-truth contract is internally inconsistent
**Documentation states**
- Entire app is client-side/localStorage with no server DB: `CLAUDE.md:5`, `CLAUDE.md:159`, `CLAUDE.md:252`.
- Portfolio state is persisted to localStorage with server mirror: `architecture.md:35`, `architecture.md:281`, `architecture.md:282`.

**Implementation does**
- `portfolioStore` persists through `jsonFileStorage` (server route), not localStorage: `src/store/portfolioStore.ts:341`, `src/store/json-storage.ts:10`, `src/store/json-storage.ts:34`.
- Separate sync path writes through `/api/portfolio/sync`: `src/hooks/useDbSync.ts:40`, `src/app/api/portfolio/sync/route.ts:12`.
- `/api/portfolio/*` requires bearer token, but sync request does not set Authorization and silently swallows failures: `src/middleware.ts:4`, `src/middleware.ts:20`, `src/hooks/useDbSync.ts:42`, `src/hooks/useDbSync.ts:44`.

**Business impact**
- Two persistence paths with different auth/error semantics can diverge silently.
- CMD-K and server-side consumers may read stale or mismatched state.

**Recommendation**
- Publish one explicit persistence contract with one authoritative write path.
- Document fallback behavior, auth requirements, and user-visible sync failure handling.
- Remove or deprecate duplicate path after transition.

### High

#### HIGH-01: `isActive` account business rule is inconsistently enforced
**Documentation states**
- `isActive` means sync enabled: `architecture.md:88`.

**Implementation does**
- Wallet sync includes all wallet accounts regardless of `isActive`: `src/services/providers/wallet-provider.ts:460`, `src/services/providers/wallet-provider.ts:462`.
- CEX sync correctly filters inactive accounts: `src/services/providers/cex-provider.ts:139`, `src/services/providers/cex-provider.ts:163`.

**Business impact**
- Users can disable accounts but still get synced wallet positions/prices.
- Portfolio totals can violate user intent and controls.

**Recommendation**
- Enforce `isActive` consistently at a shared account-selection boundary.
- Document that rule once and reuse it in all providers.

#### HIGH-02: CEX capability is documented broader than implemented
**Documentation states**
- CEX account model and flows include Binance/Coinbase/Kraken/OKX: `architecture.md:98`, `CLAUDE.md:189`, `CLAUDE.md:200`.

**Implementation does**
- Only Binance works; others are placeholders:
- Not implemented switch branches: `src/services/providers/cex-provider.ts:147`, `src/services/providers/cex-provider.ts:150`.
- UI marks non-Binance exchanges unsupported: `src/app/crypto/accounts/page.tsx:13`, `src/app/crypto/accounts/page.tsx:14`, `src/app/crypto/accounts/page.tsx:15`.

**Business impact**
- Product capability expectations are overstated.
- Integration planning and user onboarding can be misleading.

**Recommendation**
- Split docs into "supported now" vs "planned" and add status tags per exchange.
- Add release criteria for promoting an exchange from planned to supported.

#### HIGH-03: Account sync API is documented as functional but implemented as stub
**Documentation states**
- `/api/portfolio/accounts/[id]/sync` triggers account sync: `architecture.md:597`.

**Implementation does**
- Endpoint returns static `sync_triggered` response without running sync logic: `src/app/api/portfolio/accounts/[id]/sync/route.ts:5`, `src/app/api/portfolio/accounts/[id]/sync/route.ts:22`.

**Business impact**
- API consumers and operators can falsely assume a real sync occurred.

**Recommendation**
- Either implement actual behavior or document endpoint explicitly as stub/deprecated.

#### HIGH-04: Orchestration responsibility drift (service architecture vs real flow)
**Documentation states**
- `PortfolioService` coordinates all providers including CEX: `docs/SERVICE_ARCHITECTURE.md:32`, `docs/SERVICE_ARCHITECTURE.md:40`.

**Implementation does**
- `PortfolioService.refreshPortfolio` handles wallet + prices + FX only: `src/services/portfolio-service.ts:108`, `src/services/portfolio-service.ts:114`, `src/services/portfolio-service.ts:151`.
- CEX fetch/update is orchestrated in UI layer (`PortfolioProvider`): `src/components/PortfolioProvider.tsx:76`, `src/components/PortfolioProvider.tsx:81`, `src/components/PortfolioProvider.tsx:111`.

**Business impact**
- Core business refresh logic is split across service and component layers.
- Harder to reason about reliability and harder to test end-to-end consistency.

**Recommendation**
- Centralize refresh orchestration in one service boundary and document that as canonical.

#### HIGH-05: Sensitive data routes are outside middleware protection scope
**Implementation does**
- Middleware protects only `/api/portfolio/*` and `/api/chat`: `src/middleware.ts:4`, `src/middleware.ts:34`.
- DB/backup/debug routes are not in that scope: `src/app/api/db/route.ts:37`, `src/app/api/backup/route.ts:17`, `src/app/api/debug/route.ts:4`.

**Business impact**
- Data export/import/debug surfaces are comparatively less protected.
- Hardening profile is weaker than most teams expect for a portfolio system.

**Recommendation**
- Add an API auth matrix doc with required auth per route and justification.
- Define secure deployment profile requirements for non-localhost operation.

### Medium

#### MED-01: Documented parallel refresh flow is mostly sequential in code
**Documentation states**
- Wallet and price operations are parallelized: `architecture.md:412`, `architecture.md:429`.

**Implementation does**
- `refreshPortfolio` awaits wallet fetch first, then CoinGecko prices, then manual prices, then FX: `src/services/portfolio-service.ts:114`, `src/services/portfolio-service.ts:131`, `src/services/portfolio-service.ts:151`, `src/services/portfolio-service.ts:154`.
- Wallet loops are sequential per wallet in key paths: `src/services/providers/wallet-provider.ts:502`, `src/services/providers/wallet-provider.ts:653`.

**Business impact**
- Higher refresh latency and greater timeout exposure under multi-account load.

**Recommendation**
- Document actual concurrency behavior and target SLA.
- Introduce bounded parallelism and explicit provider rate-limit policies.

#### MED-02: Exposure formula documentation is stale vs implemented business logic
**Documentation states**
- `cash` contributes to `spotLongValue`, then `longExposure = (spotLong - cashEquivalents) + perpsLongs`: `docs/SERVICE_ARCHITECTURE.md:206`, `docs/SERVICE_ARCHITECTURE.md:218`.

**Implementation does**
- `cash` only increases `cashEquivalentsForLeverage`, not `spotLongValue`: `src/services/domain/portfolio-calculator.ts:1648`, `src/services/domain/portfolio-calculator.ts:1651`.
- `longExposure` is calculated directly as `spotLong + perpsLongs` because spot long already excludes cash: `src/services/domain/portfolio-calculator.ts:1793`, `src/services/domain/portfolio-calculator.ts:1799`.

**Business impact**
- Exposure semantics in docs can produce wrong analyst interpretation and reporting logic.

**Recommendation**
- Treat `portfolio-calculator.ts` as source-of-truth and update service architecture formulas accordingly.

#### MED-03: Account taxonomy differs between API and client selectors
**Implementation does**
- Accounts API defines brokerage as `manual` + no slug: `src/app/api/portfolio/accounts/route.ts:16`, `src/app/api/portfolio/accounts/route.ts:17`.
- Client `brokerageAccounts()` requires manual account with equity positions: `src/store/portfolioStore.ts:113`, `src/store/portfolioStore.ts:118`.

**Business impact**
- Empty manual brokerage accounts can be classified differently across APIs and UI selectors.

**Recommendation**
- Publish one canonical classification utility and apply it consistently in API/store/UI.

#### MED-04: Versioning/migration signals are inconsistent
**Implementation does**
- Core store/db version is 13: `src/store/portfolioStore.ts:342`, `src/app/api/portfolio/db-store.ts:36`.
- Backup/import paths still encode or default to version 10: `src/hooks/useAutoBackup.ts:7`, `src/app/settings/page.tsx:183`, `src/app/settings/page.tsx:215`.

**Business impact**
- Restore and migration behavior is harder to validate and reason about.

**Recommendation**
- Define one canonical schema version source and a documented backward-compatibility policy.

#### MED-05: Category naming in service docs is inconsistent
**Documentation states**
- Main categories list both `stocks` and `equity`: `docs/SERVICE_ARCHITECTURE.md:90`, `docs/SERVICE_ARCHITECTURE.md:91`.

**Implementation does**
- Main categories are `crypto | equities | cash | other`: `src/services/domain/category-service.ts:12`, `src/services/domain/category-service.ts:670`.

**Business impact**
- Ambiguous terminology in business docs increases interpretation errors across teams.

**Recommendation**
- Standardize terms in docs: use `equities` as main category and `stocks/etfs` as subcategories.

### Low

#### LOW-01: `ARCHITECTURE_IMPROVEMENTS.md` is mostly roadmap, not current-state architecture
**Documentation states**
- Multiple "New File" sections (example): `ARCHITECTURE_IMPROVEMENTS.md:34`, `ARCHITECTURE_IMPROVEMENTS.md:275`, `ARCHITECTURE_IMPROVEMENTS.md:536`, `ARCHITECTURE_IMPROVEMENTS.md:1023`, `ARCHITECTURE_IMPROVEMENTS.md:2195`.

**Current repo state**
- Referenced target files are missing (e.g., `src/services/portfolio-refresh.ts`, `src/services/portfolio-manager.ts`, `src/services/container.ts`, `src/services/cache/cache-service.ts`, `src/services/request-manager.ts`).

**Business impact**
- Readers can mistake roadmap for implemented architecture.

**Recommendation**
- Split into `CURRENT_ARCHITECTURE.md` and `TARGET_ARCHITECTURE.md` with explicit status tags.

#### LOW-02: Unused/legacy surface area increases cognitive and operational load
**Observed**
- Legacy account/type compatibility remains broad in types: `src/types/index.ts:48`, `src/types/index.ts:92`, `src/types/index.ts:100`.
- Legacy alias still present (`wallets()`): `src/store/portfolioStore.ts:38`, `src/store/portfolioStore.ts:135`.
- Legacy redirect route kept (`/stocks` -> `/equities`): `src/app/stocks/page.tsx:10`.
- Debug endpoint exists with direct provider passthrough and no clear integration surface: `src/app/api/debug/route.ts:4`, `src/app/api/debug/route.ts:15`.

**Business impact**
- Larger maintenance surface, harder refactors, and accidental misuse of non-canonical paths.

**Recommendation**
- Add a documented deprecation lifecycle (introduced, deprecated, removal date, owner).

## Inconsistency Summary (Quick Matrix)

| Area | Documented | Implemented | Risk |
|---|---|---|---|
| API key handling | Server adds keys, browser never sees them | Browser sends keys in URL/body | High |
| Persistence model | localStorage-first, no server DB | Server file persistence via `/api/db` plus `/api/portfolio/sync` | High |
| Account `isActive` | Sync-enabled switch | Enforced for CEX, not wallets | High |
| CEX support | Binance/Coinbase/Kraken/OKX model appears supported | Only Binance implemented | High |
| Account sync endpoint | Trigger sync | Stub response | High |
| Refresh concurrency | Parallel flow diagrams | Mostly sequential awaits | Medium |
| Exposure formulas | Cash added then subtracted from long exposure | Cash excluded from spot long from start | Medium |
| Category naming | Stocks + equity as main categories | Equities main; stocks/etfs as subs | Medium |

## Recommendations for Best Practices and Robustness

### 1) Documentation governance (highest leverage)
- Create a single owner-backed `CURRENT_ARCHITECTURE.md` aligned to shipped behavior.
- Move roadmap material to `TARGET_ARCHITECTURE.md` with status labels (`planned`, `in-progress`, `shipped`).
- Require doc updates in PRs that alter auth, persistence, account semantics, or exposure formulas.

### 2) Business logic contracts
- Publish explicit contracts for:
- account activation (`isActive`) behavior across all providers,
- account classification (wallet/cex/brokerage/cash),
- exposure math formulas and category taxonomy,
- refresh orchestration boundaries.

### 3) Security and trust-boundary hardening
- Document current key handling clearly as client-managed until changed.
- Add route-level auth requirements and default-deny policy for stateful/debug endpoints.
- Add logging redaction guidance (no key length/prefix logging in production paths).

### 4) Persistence reliability
- Consolidate to one authoritative persistence write path.
- Document sync failure behavior (retry/backoff/user feedback), not silent failure.
- Unify schema version management across store, backup, import, and restore.

### 5) Deprecation and cleanup
- Establish removal milestones for legacy aliases/types/routes.
- Keep compatibility shims only with explicit sunset dates and migration notes.

## Proposed 30/60/90-Day Documentation Plan

### 30 days
- Publish `docs/CURRENT_ARCHITECTURE.md`.
- Publish `docs/API_AUTH_MATRIX.md`.
- Publish `docs/PERSISTENCE_CONTRACT.md`.

### 60 days
- Publish `docs/BUSINESS_LOGIC_CONTRACTS.md` (account activation, classification, exposure formulas).
- Publish `docs/DEPRECATION_POLICY.md` with owners and dates.

### 90 days
- Publish `docs/TARGET_ARCHITECTURE.md` and link to active roadmap tickets.
- Archive or reframe stale architecture docs to avoid contradictory guidance.

## Final Assessment
The codebase has strong domain depth, but business documentation currently overstates some capabilities and understates several trust-boundary and consistency constraints. The most important next step is to re-establish one canonical set of architecture and business-logic contracts and enforce them as part of normal change management.
