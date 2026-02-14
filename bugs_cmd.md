# CMD-K Bug Backlog And Expected Command Matrix

Last updated: 2026-02-14
Purpose: track open CMD-K bugs and define the exact commands that must work after the roadmap implementation.

## Related Docs

- Roadmap and architecture plan: `cmdk-roadmap.md`
- Main product backlog: `bugs.md`

## Status Values

- `failing` (reproducible incorrect behavior)
- `unstable` (sometimes correct, sometimes incorrect)
- `passing` (works as expected)
- `verified` (manually + test verified after implementation)

## Open Bugs

## CMDK-001

- Title: Equity notional buys can fall back to crypto context and lose required fields.
- Severity: `S1`
- Current status: `unstable`
- Core symptom:
  - `bought 50k USD AAPL yesterday` or similar can open with crypto accounts and/or missing `amount` + `price`.
- Evidence refs:
  - `src/services/domain/action-mapper.ts:253`
  - `src/app/api/chat/route.ts:428`
  - `src/app/api/chat/route.ts:525`
  - `src/components/modals/ConfirmPositionActionModal.tsx:228`

## CMDK-002

- Title: Add-cash can create duplicate manual account instead of matching existing bank account.
- Severity: `S2`
- Current status: `unstable`
- Core symptom:
  - `Add 5000 USD to Millenium` may create a new manual account if text resolution misses the existing one.
- Evidence refs:
  - `src/services/domain/command-account-resolver.ts:60`
  - `src/services/domain/action-mapper.ts:393`
  - `src/components/modals/ConfirmPositionActionModal.tsx:769`

## CMDK-003

- Title: Balance-set semantics are not normalized in one place (`set` vs `add` behavior can be ambiguous).
- Severity: `S1`
- Current status: `unstable`
- Core symptom:
  - `Revolut USD balance = 283293` is not guaranteed to deterministically behave as an absolute set on the intended account/currency target.
- Evidence refs:
  - `src/services/domain/intent-router.ts:42`
  - `src/services/domain/tool-registry.ts:63`
  - `src/app/api/chat/route.ts:992`
  - `src/services/domain/action-mapper.ts:366`

## Expected Command Matrix (Must-Pass Top 20)

Use this matrix as the acceptance checklist after each implementation phase.

| ID | User command | Expected command id | Expected semantics | Expected targeting | Baseline status | Post-impl status |
| --- | --- | --- | --- | --- | --- | --- |
| CMD-001 | `bought 50k USD AAPL yesterday` | `buy_position` | `quantity=notional(50000)`, `date=yesterday`, `assetType=stock` | brokerage context only; never crypto fallback | unstable | todo |
| CMD-002 | `bought 50k USD MSFT yesterday` | `buy_position` | `quantity=notional(50000)`, `date=yesterday`, `assetType=stock` | brokerage context only; deterministic symbol + quote policy | unstable | todo |
| CMD-003 | `bought 10 AAPL at 185` | `buy_position` | `quantity=units(10)`, `price=185`, `assetType=stock` | brokerage context only | passing | todo |
| CMD-004 | `Add 5000 USD to Millenium` | `add_cash` (or generic equivalent) | `mode=delta`, `amount=5000`, `currency=USD` | resolve existing `Millenium` account; do not create duplicate by near-match | unstable | todo |
| CMD-005 | `Add 5000 EUR to Millenium` | `add_cash` (or generic equivalent) | `mode=delta`, `amount=5000`, `currency=EUR` | update existing Millenium EUR position if present | passing | todo |
| CMD-006 | `Revolut USD balance = 283293` | `update_position` / normalized equivalent | `mode=absolute`, `amount=283293`, `currency=USD` | deterministic account+currency resolution; no additive behavior | unstable | todo |
| CMD-007 | `Set Revolut USD balance to 283293` | `update_position` / normalized equivalent | `mode=absolute` | same target outcome as CMD-006 | unstable | todo |
| CMD-008 | `Add 500 USD to Revolut Broker` | `add_cash` (or generic equivalent) | `mode=delta`, `amount=500`, `currency=USD` | resolve `Revolut Broker` account and existing USD cash position | passing | todo |
| CMD-009 | `N26 EUR balance 4810` | `update_position` / normalized equivalent | `mode=absolute`, `amount=4810`, `currency=EUR` | resolve `N26` EUR target only | unstable | todo |
| CMD-010 | `Add 5000 USD to revolut broker` | `add_cash` (or generic equivalent) | `mode=delta`, case-insensitive account matching | account must resolve to existing manual account id | passing | todo |
| CMD-011 | `bought $50k worth of AAPL` | `buy_position` | `quantity=notional(50000)`, `assetType=stock` | brokerage context only | unstable | todo |
| CMD-012 | `bought 123 MSFT for 50k` | `buy_position` | `quantity=units(123)`, `notional=50000`, derive per-unit | brokerage context only | passing | todo |
| CMD-013 | `bought 1.5 BTC at 96k` | `buy_position` | `quantity=units(1.5)`, `price=96000`, `assetType=crypto` | crypto account context only | passing | todo |
| CMD-014 | `sold 50% of GOOGL yesterday` | `sell_partial` | `sellPercent=50`, `date=yesterday` | resolves existing equity position deterministically | passing | todo |
| CMD-015 | `sold all of AMZN` | `sell_all` | full position sell | resolves correct AMZN position/account | passing | todo |
| CMD-016 | `set BTC price to 120000` | `set_price` | custom override price | applies to BTC only | passing | todo |
| CMD-017 | `update AAPL cost basis to 90000` | `update_position` | update costBasis only | resolves AAPL target; no cross-asset fallback | passing | todo |
| CMD-018 | `remove CRM` | `remove_position` | remove position mutation | resolves CRM target only | passing | todo |
| CMD-019 | `Add 1500 CHF to Revolut` | `add_cash` (or generic equivalent) | `mode=delta`, `currency=CHF` | match existing Revolut account; update/create CHF under same account | unstable | todo |
| CMD-020 | `Set Millenium EUR balance to 60000` | `update_position` / normalized equivalent | `mode=absolute`, `currency=EUR` | resolve existing Millenium EUR target deterministically | unstable | todo |

## Verification Protocol

## Data Safety

- Never mutate production `data/db.json` during QA.
- Use temp clone path via `PORTFOLIO_DB_PATH` for mutation-flow tests.

## Manual QA Steps

1. Run CMD-K commands from the matrix in desktop UI (and mobile for confirm modal flows).
2. Confirm pending action details before submit:
  - command id
  - parsed amount/notional
  - mode (`delta` vs `absolute`)
  - resolved account and currency
3. Verify resulting position/account state after submit.
4. Update `Post-impl status` in matrix.

## Automated QA Requirements

- Add/maintain tests covering each matrix command (or a near-equivalent parser fixture).
- Required suites:
  - `src/services/domain/intent-router.test.ts`
  - `src/services/domain/action-mapper.test.ts`
  - `src/app/api/chat/route.real-db-qa.test.ts`
  - `src/components/modals/ConfirmPositionActionModal.test.tsx`

## Definition of Done (CMD-K)

- All 20 commands in `Expected Command Matrix` are `passing`.
- Critical commands (`CMD-001`, `CMD-004`, `CMD-006`) are `verified`.
- No duplicate-account creation in account near-match scenarios.
- No asset-class fallback drift for equity ticker buy commands.
