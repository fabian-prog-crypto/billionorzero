# QA Rules

## UI QA: Consistency Check

All UI changes must follow the **Design Language & Style Guide** in `CLAUDE.md`. That section is the single source of truth for fonts, spacing, colors, icons, component patterns, and formatting functions. Do not duplicate those rules here.

When reviewing UI changes, compare against adjacent pages and components visually. A new page or section should look like it belongs -- same density, same rhythm, same typography.

## Error, Loading, and Empty State Patterns

The app does not use Next.js `error.tsx` or `loading.tsx` route files. Instead:

- **Loading state**: Managed via the `isRefreshing` store flag in `portfolioStore`. Components check this flag and show inline loading indicators.
- **Empty states**: Use the `EmptyState` component (`src/components/ui/EmptyState.tsx`) with icon, title, description, and optional action button.
- **API errors**: Route handlers return `{ error: string }` JSON with appropriate HTTP status codes. Client-side code surfaces errors via inline UI, not global error boundaries (no React Error Boundary exists).

## Data QA: Portfolio Diff Check (MANDATORY)

Before merging any branch into main, you **must** perform a quantitative portfolio comparison to verify your changes do not silently alter existing portfolio data. This is a hard gate -- do not skip it.

## Procedure

1. **Baseline snapshot (main):** Check out `main`, run the app (`npm run dev`), trigger a full portfolio sync, and record the complete output -- all positions, prices, asset classifications, and calculated values (net worth, exposure metrics, category totals).

2. **Branch snapshot:** Check out your feature branch, run the app, trigger a full portfolio sync with the same wallets/accounts, and record the same data.

3. **Diff the two snapshots.** Compare position-by-position:
   - Position count, symbols, amounts, chains, protocols
   - Prices and 24h change values
   - Calculated values (position value, allocation %)
   - Exposure classifications (`classifyAssetExposure()` outputs)
   - Portfolio summary totals (net worth, gross assets, debts, category breakdowns)

## Decision rules

| Diff result | Action |
|-------------|--------|
| **Existing positions/prices/values changed** | **ABORT the merge.** Investigate why existing data differs. Fix the regression before proceeding. Do not merge until the baseline matches. |
| **Only new/additional positions appear** | **ASK the user** for explicit approval before merging. Explain what new positions were added and why. |
| **No differences** | Safe to merge. |

## Why this matters

The portfolio sync pipeline touches multiple external APIs, providers, and classification logic. A small change in any layer (API parsing, provider fallback, classification rules, price resolution order) can silently corrupt portfolio values. This diff check is the primary regression safety net.

## DB Backup Integrity Check (MANDATORY)

The file `portfolio-backup-11022026.json` (406KB, 688 positions, 34 accounts) is the canonical database backup. After completing any task — store changes, migrations, refactors, or any other work — verify:

1. **File exists**: `portfolio-backup-11022026.json` is still present in the repo root.
2. **File is unchanged**: Run `git diff portfolio-backup-11022026.json` — there must be no diff. If the file was accidentally modified or deleted, restore it immediately with `git checkout portfolio-backup-11022026.json`.
3. **No code references removed**: Any code that reads or restores from this backup must not be broken.

This is a hard gate. Never delete, overwrite, or modify the backup file. Treat it as immutable.

## DB Wipe Prevention (MANDATORY)

The `data/db.json` file is the server-side database used by CMD-K and the REST API. It must **never** be overwritten with empty or near-empty data. This has happened before (a stray curl or sync call wiped 688 positions).

### Safeguards in code

Both write endpoints have guards that reject suspiciously empty writes:

- **`POST /api/portfolio/sync`** (`src/app/api/portfolio/sync/route.ts`): Returns 409 if incoming state has 0 positions and 0 accounts but the existing db has data.
- **`PUT /api/db`** (`src/app/api/db/route.ts`): Returns 409 if incoming payload is <100 bytes but existing file is >1KB.

### Rules for developers and AI agents

1. **Never `curl` or `fetch` a write endpoint with empty/test data** against a populated database. Always verify the payload is realistic before sending.
2. **Never pipe untested output** into `/api/portfolio/sync` or `/api/db`.
3. **After any manual API testing**, verify `data/db.json` still contains real data: `node -e "const d=require('./data/db.json'); console.log(d.state?.positions?.length ?? 0, 'positions')"`.
4. **If db.json is wiped**, restore immediately from backup: `cp portfolio-backup-11022026.json data/db.json`.
