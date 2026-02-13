# Bugs Backlog And Architecture Plan

Last updated: 2026-02-13
Scope: backlog only, no implementation in this document.

## Main Sync Relevance Assessment (origin/main @ `28ff6b0`, 2026-02-13, pre-fix snapshot)

Note: this section captures the pre-fix baseline right after syncing to `origin/main`. Current statuses are updated in each bug entry and in `Batch A Fix Progress` / `Batch B Fix Progress`.

### Backup Safety
- `bugs.md` is preserved with matching checksums at:
  - `bugs.md`
  - `bugs.backup.pre-main-eval.md`
  - `/tmp/bugs.backup.pre-main-eval.md`

### Coverage And Outcome
- Evaluated against `origin/main` commit: `28ff6b0` (`Stabilize CMD-K flows, cash account modeling, and E2E suite`).
- Unique tracked bugs evaluated: `32` (`BZ-001` .. `BZ-032`).
- Still relevant: `27/32` (`84.4%`).
- Partially addressed (not fully closed): `4/32` (`12.5%`).
- Likely fixed by main changes: `1/32` (`3.1%`).
- Legacy duplicates:
  - `BUG-001` mirrors `BZ-001` -> still relevant.
  - `BUG-002` mirrors `BZ-002` -> still relevant.
  - `BUG-003` mirrors `BZ-003` -> still relevant.

### Still Relevant (Open)
- `BZ-001`, `BZ-002`, `BZ-003`, `BZ-004`, `BZ-005`, `BZ-006`, `BZ-007`, `BZ-008`, `BZ-009`, `BZ-010`, `BZ-014`, `BZ-015`, `BZ-016`, `BZ-017`, `BZ-019`, `BZ-020`, `BZ-021`, `BZ-022`, `BZ-023`, `BZ-024`, `BZ-025`, `BZ-026`, `BZ-028`, `BZ-029`, `BZ-030`, `BZ-031`, `BZ-032`.

### Partially Addressed (Keep Open)
- `BZ-011`:
  - Manual account role logic was refactored to holdings flags (`hasCash`, `hasEquity`) in `src/store/portfolioStore.ts`, reducing slug heuristics.
  - Mixed accounts still classify into both selectors, and page-level account-id filtering still leaks cross-class holdings.
- `BZ-012`:
  - Cash account linking improved from slug matching to normalized account-name matching in `src/services/domain/cash-account-service.ts` and `src/app/cash/accounts/page.tsx`.
  - Stablecoin/account-role behavior is still not canonicalized end-to-end; keep open until verified for stablecoin-only account cases.
- `BZ-013`:
  - `buy_position` now has enrichment for `totalCost` flows (`enrichBuyToolArgs`) in `src/app/api/chat/route.ts`.
  - Execution path still allows `totalCost > 0` with derived `amount` potentially unresolved in edge cases; keep open.
- `BZ-027`:
  - Copy issue (`USC`) is corrected to `USD` in `src/components/modals/AddPositionModal.tsx`.
  - Mobile fixed 2-column form layout remains (`grid grid-cols-2`), so truncation risk remains.

### Likely Fixed (Verify Then Close)
- `BZ-018`:
  - Accounts API now uses manual holdings flags aligned with store semantics in `src/app/api/portfolio/accounts/route.ts`.
  - Behavioral divergence appears resolved; still run one parity check before moving to `verified`.

## Batch A Fix Progress (2026-02-13)

### Completed In Code (Pending Manual QA)
- `BZ-003` Equities accounts now scope positions to equity class only.
- `BZ-004` Crypto accounts now scope positions to crypto class only.
- `BZ-005` Crypto wallet list/detail now scope positions to crypto class only.
- `BZ-011` Manual account role logic centralized into shared `account-role-service`.
- `BZ-012` Cash selector now treats stablecoin-linked manual accounts as cash scope.
- `BZ-018` `/api/portfolio/accounts` now uses the same shared role classification as store selectors.

### Verification Executed
- `npm run test -- src/services/domain/account-role-service.test.ts` (pass)
- `npm run test -- src/store/portfolioStore.test.ts` (pass)
- `npm run test -- src/services/domain/cash-account-service.test.ts` (pass)

## Batch B Fix Progress (2026-02-13)

### Completed In Code (Pending Manual QA)
- `BZ-001` Equities breakdown counts holdings even when a holding is currently unpriced (`value = 0`).
- `BZ-002` Dust filtering now keeps zero-valued positions visible (missing-price holdings no longer hidden as dust).
- `BZ-006` Crypto accounts/wallet valuation now includes `customPrices` and `fxRates`.
- `BZ-007` App valuation callsites now consistently include `fxRates` context (positions/exposure/performance plus category/detail pages).
- `BZ-008` Cash currency allocation display no longer applies an extra `* 100`.
- `BZ-009` Category allocation value column now renders actual values when balances are visible.
- `BZ-017` Positions API now derives allocation from `calculateAllPositionsWithPrices` for the filtered response set.

### Verification Executed
- `npm run test -- src/services/domain/portfolio-calculator.test.ts` (pass)
- `npm run test -- src/store/portfolioStore.test.ts src/services/domain/account-role-service.test.ts src/services/domain/cash-account-service.test.ts` (pass)

## Create bugs.md Backlog (Initial 3 Equities Bugs)

### Summary
- Create a backlog file with a detailed bug template and the 3 reported equities issues.
- This section captures concrete evidence from current state (`data/db.json`) and code hotspots.
- Scope in this phase is backlog creation only, no fixes.

### Public APIs / Interfaces / Types
- No public API or type changes in this phase.
- Backlog-only artifact: `bugs.md`.

### Workflow States
- `new`
- `triaged`
- `in_progress`
- `blocked`
- `fixed`
- `verified`

### Severity Scale
- `S1`: Critical correctness/data integrity issue affecting core totals or destructive mutations.
- `S2`: High-impact behavior bug causing major user confusion or incorrect views.
- `S3`: Medium-impact inconsistency in display, filtering, or non-destructive flows.
- `S4`: Low-impact polish/documentation inconsistency.

### Detailed Entry Template
- ID:
- Title:
- Status:
- Severity:
- Area:
- Reported:
- Environment/Data Snapshot:
- Symptoms:
- Expected:
- Actual:
- Repro Steps:
- Evidence:
- Suspected Root Cause:
- Fix Direction (later):
- Acceptance Criteria:

### BUG-001
- ID: `BUG-001`
- Title: Equities overview count mismatch (2 shown, 3 expected)
- Status: `new`
- Severity: `S2`
- Area: Equities -> Overview
- Reported: User report in this session
- Environment/Data Snapshot:
  - `data/db.json` contains CRM equity position:
    - `symbol: CRM`
    - `assetClass: equity`
    - `type: stock`
    - `amount: 79.3`
    - `accountId: c66e834b-6bc5-4ddd-b956-b346e31d43b0`
  - `prices.crm` is absent in current `data/db.json` state.
- Symptoms:
  - Equities overview breakdown shows 2 positions instead of expected 3.
- Expected:
  - Position count policy should be explicit and consistently applied; if "holdings count" is intended, CRM should count even when unpriced.
- Actual:
  - Count excludes CRM when value is zero.
- Repro Steps:
  - Open equities overview with current dataset.
  - Check count in stock breakdown.
  - Compare against holdings in account `c66e834b-6bc5-4ddd-b956-b346e31d43b0` (4 equities total, with CRM newly added).
- Evidence:
  - Count increments only when `p.value > 0` in `src/services/domain/portfolio-calculator.ts:2322` and `src/services/domain/portfolio-calculator.ts:2328`.
  - Equities breakdown function entrypoint at `src/services/domain/portfolio-calculator.ts:2301`.
- Suspected Root Cause:
  - Counting logic is tied to valued positions, not holdings.
- Fix Direction (later):
  - Separate `holdingsCount` from `positiveValueCount` in valuation output and use the intended metric consistently.
- Acceptance Criteria:
  - Overview count aligns with selected policy and is stable for missing-price holdings.

### BUG-002
- ID: `BUG-002`
- Title: CRM missing from equities assets list
- Status: `new`
- Severity: `S1`
- Area: Equities -> Assets / Positions
- Reported: User report in this session
- Environment/Data Snapshot:
  - CRM position exists in `data/db.json` (`assetClass: equity`, `type: stock`).
  - `hideDust` is `true` in persisted state (`data/db.json`).
  - `prices.crm` is not present, so CRM value resolves to zero.
- Symptoms:
  - CRM does not appear in equities assets/positions view.
- Expected:
  - Equity holding should be visible with deterministic missing-price behavior.
- Actual:
  - Zero-valued CRM can be filtered out under dust filtering.
- Repro Steps:
  - Open equities positions/assets page with current state.
  - Ensure hide dust is enabled.
  - Search for CRM and observe it missing.
- Evidence:
  - Dust filter is applied in equities positions page: `src/app/equities/positions/page.tsx:77`.
  - Dust filter behavior implementation: `src/services/domain/portfolio-calculator.ts:122`.
  - Current filter code hides low absolute values including zero: `src/services/domain/portfolio-calculator.ts:129`.
- Suspected Root Cause:
  - Missing price yields zero value; dust filter removes position while the user still expects holding visibility.
- Fix Direction (later):
  - Define policy for zero/missing-priced holdings and enforce in a shared visibility policy layer.
- Acceptance Criteria:
  - CRM appears according to explicit policy; behavior matches overview counts and asset list semantics.

### BUG-003
- ID: `BUG-003`
- Title: Cash positions wrongly included in equities accounts context
- Status: `new`
- Severity: `S1`
- Area: Equities -> Accounts
- Reported: User report in this session
- Environment/Data Snapshot:
  - Brokerage account `c66e834b-6bc5-4ddd-b956-b346e31d43b0` currently has 6 positions:
    - 4 equity positions
    - 2 cash positions (`CASH_CHF_1769344861626`, `CASH_EUR_1770535657043`)
- Symptoms:
  - Equities accounts page shows Revolut brokerage plus cash symbols and inconsistent equities-context totals.
- Expected:
  - Equities account views should include equity-role positions only.
- Actual:
  - Any position with matching `accountId` is included, regardless of asset class.
- Repro Steps:
  - Open equities accounts page.
  - Inspect Revolut brokerage account contents.
  - Observe cash positions included in account asset count/value.
- Evidence:
  - Page filtering includes all positions by account id only: `src/app/equities/accounts/page.tsx:26`.
  - Store selectors can classify same manual account in overlapping ways:
    - brokerage inference: `src/store/portfolioStore.ts:113`
    - cash inference: `src/store/portfolioStore.ts:124`
- Suspected Root Cause:
  - Account-context page filtering is account-id based rather than role/classification based.
- Fix Direction (later):
  - Move account/position classification to a single shared module and filter page projections by canonical role.
- Acceptance Criteria:
  - Equities accounts page excludes cash holdings and reflects pure equities totals/counts.

### Next Fix Order
1. `BUG-003` (data association and equities account inclusion issue has highest UX impact)
2. `BUG-001`
3. `BUG-002` (likely impacted by price/missing-value and visibility policy decisions)

### Test Cases And Scenarios (For Later Fix Phase)
1. Equities overview count policy:
  - Case: 3 stocks where one has missing price (value=0).
  - Verify whether count should be 3 (holdings count) or 2 (valued count), then enforce consistently.
2. Equities assets visibility:
  - Case: equity position with missing price and `hideDust=true`.
  - Verify expected visibility rule (shown with missing price marker vs hidden), then enforce deterministically.
3. Equities accounts purity:
  - Case: brokerage account contains linked equity and cash positions.
  - Verify equities/accounts view displays only equity positions and equity subtotal.
4. Account classification overlap:
  - Case: manual account with slug and equity holdings.
  - Verify selectors and account-context pages do not cross-contaminate category views.

### Assumptions And Defaults
1. Backlog format uses the detailed template above.
2. This phase is documentation and triage only; no code fixes.
3. Evidence baseline is current `data/db.json` snapshot in this session.
4. Original bug wording is retained and expanded with technical evidence.

## Reported Bugs (Initial)

### BZ-001 Equities overview breakdown shows 2 positions instead of 3
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Equities -> Overview
- Reported behavior: total positions in breakdown shows `2` while expected is `3`.
- Likely cause: position count is based on `value > 0`, so holdings with missing prices can be excluded from counts.
- Evidence: `src/services/domain/portfolio-calculator.ts:2322`, `src/services/domain/portfolio-calculator.ts:2328`
- Acceptance criteria: equities overview position count matches actual holdings in scope even when one holding has missing/zero priced value.

### BZ-002 Equities assets do not show CRM positions
- Severity: Critical
- Status: Fixed (2026-02-13, pending QA)
- Area: Equities -> Assets
- Reported behavior: CRM position is missing from equities assets.
- Likely cause: missing pricing plus visibility rules (dust/hide-zero behavior) lead to silent exclusion.
- Evidence: `src/services/domain/portfolio-calculator.ts:2301`
- Acceptance criteria: CRM appears in equities assets when a position exists, with explicit state for missing price if needed.

### BZ-003 Equities accounts show Revolut brokerage plus strange associated cash positions not reflected in totals
- Severity: Critical
- Status: Fixed (2026-02-13, pending QA)
- Area: Equities -> Accounts
- Reported behavior: Revolut brokerage appears correctly, but `CASH_EUR_1770535657043` and another cash position appear associated/weird and are not reflected consistently.
- Likely cause: account filtering by `accountId` only allows cash positions linked to brokerage accounts to leak into equities account views.
- Evidence: `src/app/equities/accounts/page.tsx:26`, `src/services/domain/account-role-service.ts:90`
- Acceptance criteria: equities account view includes only equities positions; cash positions in brokerage accounts are excluded from equities totals and listings.

## Additional Bugs Found Across Asset Classes

### BZ-004 Crypto accounts also include cash positions when filtering by account id only
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Crypto -> Accounts
- Evidence: `src/app/crypto/accounts/page.tsx:29`, `src/services/domain/account-role-service.ts:90`
- Acceptance criteria: crypto accounts view is filtered by asset class role, not account id alone.

### BZ-005 Crypto wallets page can include non-crypto holdings due to account-centric filter
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Crypto -> Wallets
- Evidence: `src/app/crypto/wallets/page.tsx:52`, `src/app/crypto/wallets/[id]/page.tsx:55`, `src/services/domain/account-role-service.ts:19`
- Acceptance criteria: wallets page includes only crypto-role positions.

### BZ-006 Missing `customPrices` in crypto pages causes valuation drift
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Crypto pages
- Evidence: `src/app/crypto/accounts/page.tsx:30`, `src/app/crypto/wallets/page.tsx:58`
- Acceptance criteria: all valuation calls include consistent context (`prices`, `customPrices`, `fxRates` where needed).

### BZ-007 Missing `fxRates` in major pages causes cross-currency totals mismatch
- Severity: Critical
- Status: Fixed (2026-02-13, pending QA)
- Area: Overview / Positions / Exposure / Performance
- Evidence: `src/app/page.tsx:28`, `src/app/page.tsx:33`, `src/app/positions/page.tsx:153`, `src/app/positions/page.tsx:158`, `src/app/exposure/page.tsx:16`, `src/app/performance/page.tsx:21`
- Acceptance criteria: all top-level totals and allocations are computed with fx context.

### BZ-008 Cash currency allocation is multiplied by 100 again
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Cash -> Currency detail
- Evidence: `src/app/cash/currency/[code]/page.tsx:179`
- Acceptance criteria: allocation displays consistently with other pages (no double scaling).

### BZ-009 Category view hides allocation value column when balances are visible
- Severity: Medium
- Status: Fixed (2026-02-13, pending QA)
- Area: Shared component (`CategoryView`)
- Evidence: `src/components/CategoryView.tsx:259`
- Acceptance criteria: allocation value is shown whenever allocation percent is shown.

### BZ-010 Cash position edit/delete operates by currency, not by unique position
- Severity: Critical
- Status: Open
- Area: Cash -> Positions
- Evidence: `src/app/cash/positions/page.tsx:99`, `src/app/cash/positions/page.tsx:139`
- Acceptance criteria: editing or deleting one cash position affects only that position id.

### BZ-011 Account role classification overlap in selectors can misclassify accounts
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: Store selectors
- Evidence: `src/services/domain/account-role-service.ts:34`, `src/services/domain/account-role-service.ts:79`, `src/store/portfolioStore.ts:117`, `src/store/portfolioStore.ts:126`
- Acceptance criteria: account role assignment is deterministic and mutually exclusive unless intentionally multi-role.

### BZ-012 Stablecoins in cash accounts can show as unlinked
- Severity: Medium
- Status: Fixed (2026-02-13, pending QA)
- Area: Cash -> Accounts
- Evidence: `src/services/domain/account-role-service.ts:26`, `src/store/portfolioStore.ts:126`, `src/app/cash/accounts/page.tsx:100`
- Acceptance criteria: stablecoins linked to a cash account are represented under the correct account.

### BZ-013 Chat `buy_position` contract allows `totalCost` without `amount`, implementation does not
- Severity: Critical
- Status: Open
- Area: Chat tool execution
- Evidence: `src/services/domain/tool-registry.ts:16`, `src/app/api/chat/route.ts:239`, `src/app/api/chat/route.ts:281`
- Acceptance criteria: API contract and implementation agree; total-cost buys compute amount correctly or reject with clear validation.

### BZ-014 Chat `add_cash` can create ambiguous account linkage and account naming mismatch
- Severity: High
- Status: Open
- Area: Chat tool execution
- Evidence: `src/app/api/chat/route.ts:396`
- Acceptance criteria: cash insertion always resolves to a canonical account id and naming/account semantics stay consistent with UI flows.

### BZ-015 Chat `update_cash` account match uses fuzzy `includes` and can target wrong account
- Severity: High
- Status: Open
- Area: Chat tool execution
- Evidence: `src/app/api/chat/route.ts:418`
- Acceptance criteria: account resolution is id-based or strict unique-key based.

### BZ-016 Chat query tools still use legacy `asset.type` filtering in places
- Severity: High
- Status: Open
- Area: Chat query tools
- Evidence: `src/app/api/chat/route.ts:167`, `src/app/api/chat/route.ts:175`
- Acceptance criteria: chat query tools use canonical role/classification selectors.

### BZ-017 Positions API returns value-enriched rows with inconsistent allocation semantics
- Severity: Medium
- Status: Fixed (2026-02-13, pending QA)
- Area: `/api/portfolio/positions`
- Evidence: `src/app/api/portfolio/positions/route.ts:35`
- Acceptance criteria: API response contract explicitly defines and provides consistent allocation behavior.

### BZ-018 Accounts API `type` filter semantics diverge from UI/store classification semantics
- Severity: High
- Status: Fixed (2026-02-13, pending QA)
- Area: `/api/portfolio/accounts`
- Evidence: `src/app/api/portfolio/accounts/route.ts:10`, `src/app/api/portfolio/accounts/route.ts:52`, `src/store/portfolioStore.ts:117`
- Acceptance criteria: API and UI use shared classification module and produce identical account-type results.

### BZ-019 Partial sell REST route does not mirror domain cost-basis logic
- Severity: Critical
- Status: Open
- Area: `/api/portfolio/positions/[id]/sell`
- Evidence: `src/app/api/portfolio/positions/[id]/sell/route.ts`
- Acceptance criteria: partial sells reduce amount and cost basis proportionally and consistently with domain command logic.

### BZ-020 Investigate: Add cash flow may always create a new position id for same currency/account
- Severity: Medium
- Status: Investigate
- Area: Add Position modal
- Evidence: `src/components/modals/AddPositionModal.tsx:182`
- Acceptance criteria: adding cash to existing currency/account updates existing position when appropriate or intentionally creates separate lots with explicit UX.

## Category/UI Bugs Found In App Review

### BZ-021 Mobile category tabs clip and overflow instead of scrolling/wrapping
- Severity: High
- Status: Open
- Area: Global category navigation (`All/Crypto/Equities/Cash/Others`)
- Symptoms:
  - On mobile viewport, top category tabs are cut off (right side clipped).
- Evidence:
  - Mobile screenshot: `output/playwright/mobile-equities.png`
  - Fixed 28px tab typography in inline styles: `src/components/AppShell.tsx:305`, `src/components/AppShell.tsx:306`
  - Tabs container lacks overflow handling in component: `src/components/AppShell.tsx:296`, `src/components/AppShell.tsx:297`
  - Responsive `.sub-tabs` CSS exists but is not used by AppShell markup: `src/app/globals.css:492`, `src/app/globals.css:498`
- Acceptance criteria:
  - Category tabs are fully reachable on mobile (either horizontally scrollable with clear affordance or wrapped without clipping).

### BZ-022 Mobile control rows are cramped/clipped on category asset pages
- Severity: Medium
- Status: Open
- Area: Category assets controls (filters/search/actions)
- Symptoms:
  - Search/action controls are partially clipped on narrow viewports.
- Evidence:
  - Mobile screenshot: `output/playwright/mobile-crypto-assets.png`
  - Controls row layout with spacer and fixed control widths: `src/app/crypto/assets/page.tsx:301`, `src/app/crypto/assets/page.tsx:302`
  - Reusable search input has hardcoded width `120px`: `src/components/ui/SearchInput.tsx:19`
- Acceptance criteria:
  - Controls remain usable without clipping at mobile widths, with predictable wrapping/stacking.

### BZ-023 Typography system is inconsistent (loaded fonts not used globally, inline serif overrides)
- Severity: Medium
- Status: Open
- Area: Global typography consistency
- Symptoms:
  - Mixed typography across core navigation and body text leads to inconsistent visual rhythm.
- Evidence:
  - Geist fonts are loaded in layout: `src/app/layout.tsx:8`, `src/app/layout.tsx:13`
  - Body still forces Inter/system stack instead of loaded app font variable: `src/app/globals.css:94`
  - AppShell logo and category tabs override with inline Georgia serif: `src/components/AppShell.tsx:212`, `src/components/AppShell.tsx:305`
- Acceptance criteria:
  - App-wide typography comes from one deliberate tokenized system with only intentional exceptions.

### BZ-024 Theme token bypass in wallet network tags (hardcoded orange + dark classes)
- Severity: Medium
- Status: Open
- Area: Crypto -> Wallets tags
- Symptoms:
  - Perp exchange tags use direct Tailwind orange/dark classes, diverging from app theme tokens and risking theme inconsistency.
- Evidence:
  - Hardcoded class: `src/app/crypto/wallets/page.tsx:231`
  - Desktop screenshot showing visually distinct tag style: `output/playwright/crypto-wallets.png`
- Acceptance criteria:
  - Wallet network/exchange tags use shared semantic theme tokens, matching light/dark palette strategy used elsewhere.

### BZ-025 Donut chart tooltip text drops to 8px/9px and is hard to read
- Severity: Medium
- Status: Open
- Area: Shared charts (`DonutChart`)
- Symptoms:
  - Breakdown rows and overflow label in tooltip are too small for readability/accessibility.
- Evidence:
  - `text-[9px]` on breakdown lines: `src/components/charts/DonutChart.tsx:179`
  - `text-[8px]` on `+N more`: `src/components/charts/DonutChart.tsx:185`
- Acceptance criteria:
  - Minimum chart tooltip typography meets consistent readable baseline (aligned with app’s body/auxiliary scale).

### BZ-026 Color source-of-truth drift creates inconsistent category colors
- Severity: Medium
- Status: Open
- Area: Category color system
- Symptoms:
  - Same conceptual categories can get different colors depending on code path/module.
- Evidence:
  - `RWA` color differs across sources:
    - `src/lib/colors.ts:117` (`#795548`)
    - `src/services/domain/category-service.ts:285` (`#8D6E63`)
  - Additional duplicated color maps in calculator: `src/services/domain/portfolio-calculator.ts:1427`
- Acceptance criteria:
  - Category/subcategory colors come from one imported source shared by domain + UI, with no divergent duplicates.

## Modal UI Bugs Found In App Review

### BZ-027 Add Position modal uses fixed 2-column form on mobile, causing truncation
- Severity: High
- Status: Open
- Area: Add Position modal
- Symptoms:
  - On mobile width, `Amount` and `Cost basis` stay side-by-side, causing cramped inputs and clipped placeholder text (`Total cost in USC`).
- Evidence:
  - Mobile screenshot: `output/playwright/modal-add-position-mobile-v3.png`
  - Two-column layout without mobile breakpoint: `src/components/modals/AddPositionModal.tsx:680`
  - Similar fixed two-column pattern in manual mode: `src/components/modals/AddPositionModal.tsx:638`
- Acceptance criteria:
  - Modal form fields stack correctly on narrow viewports and no input text/placeholder is clipped.

### BZ-028 Confirm action modal primary CTA overflows for long symbols
- Severity: Medium
- Status: Open
- Area: Confirm Position Action modal
- Symptoms:
  - Primary button wraps with long symbol-based labels (e.g., `Update CASH_CHF_...`), reducing readability and visual balance.
- Evidence:
  - Desktop screenshot: `output/playwright/modal-confirm-action-desktop-v2.png`
  - Mobile screenshot: `output/playwright/modal-confirm-action-mobile-v3.png`
  - Label construction includes full symbol: `src/components/modals/ConfirmPositionActionModal.tsx:639`
- Acceptance criteria:
  - CTA labels stay readable and stable (truncate, short label, or metadata moved outside button).

### BZ-029 Modal form label typography is inconsistent and too small in complex action modal
- Severity: Medium
- Status: Open
- Area: Confirm Position Action modal
- Symptoms:
  - Heavy use of `text-[10px] uppercase` labels creates low readability and inconsistent hierarchy vs other modal fields using `text-sm`.
- Evidence:
  - Representative labels: `src/components/modals/ConfirmPositionActionModal.tsx:715`, `src/components/modals/ConfirmPositionActionModal.tsx:748`, `src/components/modals/ConfirmPositionActionModal.tsx:950`
  - Contrast with larger modal labels in Custom Price modal: `src/components/modals/CustomPriceModal.tsx:117`
- Acceptance criteria:
  - Modal typography scale is normalized across modals with a consistent, readable minimum size.

### BZ-030 Modals do not support keyboard `Escape` close behavior
- Severity: Medium
- Status: Open
- Area: Modal accessibility and interaction
- Symptoms:
  - Modal close currently depends on backdrop/click controls; `Escape` close behavior is absent.
- Evidence:
  - Modal components use backdrop and close-button handlers only:
    - `src/components/modals/AddPositionModal.tsx:259`
    - `src/components/modals/AddWalletModal.tsx:211`
    - `src/components/modals/CustomPriceModal.tsx:64`
    - `src/components/modals/ConfirmPositionActionModal.tsx:682`
  - No modal-level keydown handling for `Escape` found in these components.
- Acceptance criteria:
  - All modals close on `Escape` consistently and predictably.

### BZ-031 Custom Price modal header text handling degrades with long asset identifiers
- Severity: Low
- Status: Open
- Area: Custom Price modal
- Symptoms:
  - Long symbol/name combinations produce visually dense, multi-line subtitle near the close button, weakening header hierarchy.
- Evidence:
  - Mobile screenshot: `output/playwright/modal-custom-price-mobile-v3.png`
  - Header subtitle rendering: `src/components/modals/CustomPriceModal.tsx:73`, `src/components/modals/CustomPriceModal.tsx:74`
- Acceptance criteria:
  - Header subtitle is constrained (truncate/wrap policy) and remains visually balanced on mobile and desktop.

### BZ-032 Modal error/border styling bypasses semantic token system via hardcoded RGBA
- Severity: Low
- Status: Open
- Area: Modal theming consistency
- Symptoms:
  - Some error container borders use hardcoded RGBA values instead of semantic theme tokens.
- Evidence:
  - `src/components/modals/ConfirmPositionActionModal.tsx:1632`
- Acceptance criteria:
  - Modal status surfaces use shared semantic tokens only (no hardcoded palette fragments).

## Cross-Cutting Root Causes

- Filtering and grouping logic is duplicated across pages/APIs instead of centralized selectors.
- Valuation context is inconsistent (`prices`, `customPrices`, `fxRates` not passed uniformly).
- Classification semantics differ across layers (UI selectors vs API filter logic vs chat tool logic).
- Mutation paths are not normalized (UI/API/chat use different matching and update behavior).
- Presentation and calculation semantics are mixed (counting by value, display allocations with ad-hoc transforms).

## Architecture Plan (Single Sources Of Truth)

### Goals
- One canonical classification source for account and position roles.
- One canonical valuation source for totals, per-position value, and allocations.
- One canonical mutation source for add/edit/delete/buy/sell/cash flows.
- UI pages and APIs consume shared projection/query layers, not custom page logic.

### Design Principles
- Domain-first: all pages/APIs call domain selectors/commands instead of re-implementing business rules.
- Explicit context: valuation functions always receive the full context object.
- Deterministic classification: no ad-hoc string matching or fallback heuristics spread across pages.
- Contract-first responses: API response fields have clear and testable semantics.

### Proposed Modules

### 1) `domain/classification`
- Responsibility: classify positions and accounts into canonical roles.
- Inputs: raw `positions`, `accounts`, `assets`, optional policy config.
- Outputs: `positionRole`, `accountRole`, link validity flags.
- Notes:
  - Define role enums (example): `equity`, `crypto`, `cash`, `mixed`, `unlinked`.
  - Provide single selector entry points used by UI, API, and chat.

### 2) `domain/valuation`
- Responsibility: compute value, base-currency value, totals, allocation, and counts.
- Inputs: canonical `ValuationContext` (`positions`, `assets`, `prices`, `customPrices`, `fxRates`, `baseCurrency`).
- Outputs: `positionValuation[]`, `categoryTotals`, `portfolioTotals`, `countMetrics`.
- Notes:
  - Separate "count of holdings" from "count of positive-valued holdings".
  - Encode missing price states explicitly.

### 3) `domain/projections`
- Responsibility: produce view models for pages and API endpoints.
- Inputs: outputs from classification and valuation modules.
- Outputs: `equitiesOverviewVM`, `cryptoAccountsVM`, `cashCurrencyVM`, etc.
- Notes:
  - Prevent page-level filtering logic from diverging.
  - Align API and UI outputs via same projection builders.

### 4) `domain/commands`
- Responsibility: all mutations (buy/sell/add cash/update cash/edit/delete positions).
- Inputs: typed command payload + current state snapshot.
- Outputs: deterministic patch/set of state changes + validation errors.
- Notes:
  - Remove fuzzy account matching.
  - Guarantee cost-basis correctness for partial sells.
  - Reuse commands from UI actions, REST endpoints, and chat tool handlers.

### 5) `domain/policies`
- Responsibility: shared feature policies and visibility rules.
- Examples: dust visibility, asset-class inclusion rules, stablecoin treatment, missing-price display.
- Notes:
  - Make policy-driven behavior explicit and testable.

## Migration Plan (No Implementation Yet)

### Phase 0 Inventory and Contract Freeze
- Define canonical role and valuation contracts in docs/types.
- Map current call sites that compute totals/filter accounts/positions.
- Add failing regression tests for each backlog item before refactor.
- Exit criteria: contract types approved and test matrix captures known bugs.

### Phase 1 Centralize Classification
- Implement `domain/classification` and replace page/API/chat ad-hoc type filters.
- Migrate equities/crypto/cash account selectors first.
- Exit criteria: BZ-003, BZ-004, BZ-005, BZ-011, BZ-012, BZ-016, BZ-018 covered.

### Phase 2 Centralize Valuation
- Implement `domain/valuation` with strict context object and explicit missing-price handling.
- Replace page-level calculation calls with shared valuation adapters.
- Exit criteria: BZ-001, BZ-002, BZ-006, BZ-007, BZ-008, BZ-009, BZ-017 covered.

### Phase 3 Centralize Mutations
- Implement `domain/commands` for buy/sell/cash operations.
- Route UI, REST, and chat mutations through same command handlers.
- Exit criteria: BZ-010, BZ-013, BZ-014, BZ-015, BZ-019, BZ-020 covered.

### Phase 4 Projection Layer Adoption
- Build shared projections for every asset-class page and corresponding APIs.
- Remove duplicated page-specific filter and aggregation code.
- Exit criteria: UI/API parity snapshots pass across all asset classes.

### Phase 5 Hardening
- Add invariant tests and property-style checks on classification/valuation/commands.
- Add fixture packs for mixed brokerage/cash/crypto accounts and missing-price scenarios.
- Exit criteria: no known regression across overview, accounts, assets, positions, exposure, performance.

## Test Matrix To Prevent Recurrence

- Equities overview: counts include missing-price holdings but value metrics reflect pricing state.
- Equities assets: CRM and other missing-price symbols visible with explicit state.
- Equities accounts: brokerage-linked cash not included in equities totals/list.
- Crypto accounts/wallets: non-crypto linked positions excluded.
- Cash currency: allocation percentage and value display consistent with global totals.
- Cash positions: edit/delete scoped by unique position id.
- Overview/positions/exposure/performance: totals match when fxRates/customPrices are present.
- API parity: `/accounts`, `/positions` responses match UI projections.
- Chat parity: query/mutation tools produce same results as direct UI/API operations.

## Prioritization Order

1. Critical correctness in user-visible totals and mutations: BZ-002, BZ-003, BZ-007, BZ-010, BZ-013, BZ-019.
2. Cross-layer consistency and classification unification: BZ-004, BZ-005, BZ-011, BZ-016, BZ-018.
3. Valuation and display quality fixes: BZ-001, BZ-006, BZ-008, BZ-009, BZ-017.
4. Additional cash/chat hardening and investigation: BZ-012, BZ-014, BZ-015, BZ-020.

## Definition Of Done For This Backlog

- Every bug has a reproducible test case and owner.
- All asset-class pages consume shared classification/valuation/projection modules.
- All mutation entry points share command handlers.
- API, UI, and chat outputs are consistent for the same input snapshot.
