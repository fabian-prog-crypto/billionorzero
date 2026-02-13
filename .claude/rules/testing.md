# Testing Rules

## Mandatory Test Coverage

Any new module or significant change to an existing module MUST include corresponding unit tests before merging. This is a hard requirement.

### What must be tested

1. **Server-side utilities** (`src/lib/`, `src/services/`): Every exported function needs tests covering happy path, edge cases, and error cases.

2. **Session/auth modules** (`src/lib/session-store.ts`, `src/lib/api-token.ts`):
   - Token generation returns valid format
   - Token validation accepts valid tokens, rejects tampered/expired/malformed tokens
   - Cross-runtime compatibility (Web Crypto API availability)
   - Expiry boundary conditions (just before and just after expiry window)

3. **API route handlers** (`src/app/api/`): Test request/response contracts, auth requirements, error responses.

4. **Store logic** (`src/store/`): Test actions, selectors, migrations, and persistence.

5. **Domain logic** (`src/services/domain/`): Pure functions must have thorough unit tests.

### Test commands

```bash
npx vitest run                              # All unit/integration tests
npx vitest run src/lib/session-store.test.ts # Specific test file
npx playwright test                          # All E2E tests
npx playwright test e2e/command-palette      # CMD-K E2E tests
```

### Rules

- Test files live next to their source: `foo.ts` -> `foo.test.ts`
- Use Vitest for unit/integration tests, Playwright for E2E
- Mock external dependencies (APIs, localStorage) — never depend on external services
- When changing async/sync signatures, verify callers are updated and tested
- When introducing runtime-sensitive code (Edge vs Node.js), test that the API surface works in the Vitest (Node.js) environment at minimum

## Test Patterns

Established patterns used across the codebase. Follow these when writing new tests.

### Unit tests: jsdom environment

Component tests that need DOM APIs must use the Vitest jsdom pragma at the top of the file:

```ts
// @vitest-environment jsdom
```

### Unit tests: mocking services

Use `vi.mock()` to mock service imports. Place mocks before imports that use them:

```ts
vi.mock('@/services/providers/price-provider', () => ({
  getPriceProvider: () => ({ getPrice: vi.fn() })
}));
```

### Unit tests: React components

Use React Testing Library with `userEvent` for interaction tests:

```ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

### Store tests: resetting state

Always reset the store to initial state between tests to avoid leakage:

```ts
import { usePortfolioStore, getInitialState } from '@/store/portfolioStore';

beforeEach(() => {
  usePortfolioStore.setState(getInitialState());
});
```

### Store tests: fixture factories

Use the factory functions in store test files (e.g., `makeWalletAccount()`, `makePosition()`) to create test data with sensible defaults. Add new factories when a new entity type needs repeated test setup.

## Position Integrity (MANDATORY)

Positions are the core data in the app. Any code that writes, syncs, or replaces positions **must** be tested to ensure it does not silently lose data. This section exists because a partial sync once wiped 61% of positions (688 → 270) and deleted all debt positions.

### Runtime guards

The sync pipeline has three guards in `src/app/api/portfolio/sync-guards.ts`. These are the last line of defense:

| Guard | What it catches | Threshold |
|-------|----------------|-----------|
| `guardTotalWipe` | Incoming state has 0 positions + 0 accounts | Existing > 0 |
| `guardPartialLoss` | Position count drops >50% | Existing ≥ 10 positions |
| `guardDebtLoss` | All debt positions disappear | Existing has any debts |

Both write endpoints (`POST /api/portfolio/sync`, `PUT /api/db`) enforce these guards. **Never bypass or weaken them.**

### What must be tested for position integrity

Any code that modifies position arrays must include tests verifying:

1. **No silent data loss**: Syncing one account must not delete positions from other accounts.
2. **Debt preservation**: Debt positions (`isDebt: true`) must survive any sync or write operation. They represent real liabilities.
3. **Cross-account isolation**: `setSyncedPositions(['w1'], newPositions)` must only replace positions with `accountId === 'w1'`. All other positions (other wallets, CEX accounts, manual, orphans) must be untouched.
4. **Threshold guards**: Any new write path to `db.json` must use `runSyncGuards()` from `sync-guards.ts`. Test that the guard rejects writes that would lose >50% of positions.
5. **Orphan safety**: Positions with no `accountId` must never be discarded during sync.

### Test files for reference

- `src/app/api/portfolio/sync-guards.test.ts` — Tests for all three guards, including the exact 688→270 bug scenario.
- `src/store/portfolioStore.test.ts` — `setSyncedPositions (position integrity)` section tests cross-account safety and debt preservation.

### Rules for any new sync/write code

- **Never replace all positions at once.** Use `setSyncedPositions(accountIds, newPositions)` which scopes the replacement to specific accounts.
- **Never write to db.json without running guards.** Use `writeDb()` through the sync route, or call `runSyncGuards()` before any direct write.
- **Add a regression test** that seeds the before-state, runs the operation, and asserts all unrelated positions survived.

## E2E Test Rules

### Seed data format

- **Seed data must match store v13** with unified `accounts[]` array and `AccountConnection` discriminated union. Do not use legacy `wallets[]`, `brokerageAccounts[]`, or `cashAccounts[]`.
- Use `seedLocalStorage()` from `e2e/fixtures/test-helpers.ts` to inject store data.
- **Seed `api-session-token`** via `seedApiToken()` for tests that hit protected API routes (`/api/chat`, `/api/portfolio/*`).

### Test setup

- Use `test` and `expect` from `e2e/fixtures/test-helpers.ts` which provides the `seededPage` fixture (a Playwright `Page` with localStorage pre-seeded).
- **Mock external APIs** (Ollama, CoinGecko, etc.) via `page.route()`. Never depend on external services running.

### When E2E tests are required

- **Any changes to API routes or CMD-K must include/update relevant E2E tests.**

## Store Migrations

The Zustand `portfolioStore` uses versioned persistence with a `migrate()` function. Current version: **13**.

### When to bump the version

Bump when you change the shape of persisted state — adding, removing, or renaming fields in `PortfolioState` that are stored in localStorage.

### How to write a migration

Add an `if (version < N)` block in the `migrate()` function in `src/store/portfolioStore.ts`:

```ts
if (version < 14) {
  // Transform state from v13 shape to v14 shape
  state.newField = deriveFromOldData(state);
}
```

Migrations run sequentially — a user on v11 will run v12, v13, and v14 migrations in order.

### Testing migrations

- Test that old data formats are correctly transformed to the new shape
- Test round-trip: seed old-format data → run migration → verify new-format state
- Test edge cases: missing fields, null values, empty arrays
