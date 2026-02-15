# Coinbase CEX Integration Plan (Analysis)

## Goal
Add Coinbase CEX syncing with the same UX and architectural pattern as the existing Binance integration. This includes API proxying, provider parsing, account management UI, and tests.

## Current State (Binance Pattern)
- **API proxy**: `src/app/api/cex/binance/route.ts`
  - Server-side HMAC signing and credentialed fetch to Binance.
  - Exposes a single POST endpoint that accepts `{ apiKey, apiSecret, endpoint }`.
- **Provider**: `src/services/providers/cex-provider.ts`
  - `fetchBinanceBalances()` calls `/api/cex/binance` and maps balances into `Position[]`.
  - `fetchCexAccountPositions()` selects by `connection.dataSource`.
  - `fetchAllCexPositions()` aggregates across accounts and isolates errors.
- **UI / Accounts**: `src/app/crypto/accounts/page.tsx`
  - `EXCHANGE_INFO` marks Binance supported.
  - Add Account modal validates credentials via `/api/cex/binance` regardless of selected exchange.
  - Sync uses `fetchAllCexPositions`.
- **Types / Store**: `src/types/index.ts` and `src/store/portfolioStore.ts`
  - `CexConnection` contains `{ dataSource, apiKey, apiSecret, lastSync }`.
  - CEX accounts included in selectors and portfolio calculations.

## Coinbase Integration Scope
1. **API proxy** (new)
   - Add `src/app/api/cex/coinbase/route.ts` using Coinbase Advanced Trade:
     - `POST` accepts `{ apiKey, apiSecret, endpoint }` where `apiSecret` is the EC private key (PEM).
     - Calls Coinbase Advanced Trade endpoints for account balances.
     - Generates JWT server-side (`iss: "cdp"`, `sub: apiKey`, `uri: "<METHOD> <HOST><PATH>"`).
   - Define endpoint mapping (e.g., `endpoint: 'accounts'`) → `/api/v3/brokerage/accounts`.
   - Error handling and JSON passthrough consistent with Binance.

2. **CEX provider updates**
   - Add `fetchCoinbaseBalances(account)` in `src/services/providers/cex-provider.ts`.
   - Route Coinbase accounts to this function in `fetchCexAccountPositions`.
   - Normalize Coinbase account/balance response into `Position[]`:
     - `symbol` lowercased currency code.
     - `name` resolved via existing `ASSET_NAME_MAP` or symbol fallback.
     - `amount` set to available + hold (if Coinbase separates them).
     - `accountId` set to account id.
     - `chain` set to `'coinbase'`.
     - `assetClass` via `categoryService.getAssetClass(symbol, 'crypto')`.

3. **UI / Account management**
   - `src/app/crypto/accounts/page.tsx`
     - Mark Coinbase as `supported: true`.
     - Add Account modal:
       - Validate credentials using `/api/cex/coinbase` when exchange is Coinbase.
       - Update security note to mention Coinbase instead of Binance (or make conditional).
     - Empty state copy: “Connect your Coinbase account…” if Coinbase is selected or make generic.
   - Ensure Coinbase accounts render correctly in account lists (logo/name already present).

4. **Tests**
   - `src/services/providers/cex-provider.test.ts`:
     - Add Coinbase tests:
       - Successful balance fetch parsing.
       - Zero-balance filtering.
       - Credential validation error propagation.
     - Ensure `fetchAllCexPositions()` handles Coinbase accounts.
   - If Coinbase requires extra credentials (e.g., private key), add tests for required validation.

## Auth & Data Contract Decisions (Need Confirmation)
Coinbase has multiple API products with different auth:
- **Advanced Trade API** (API key name + private key/JWT).
- **Legacy Coinbase Pro** (API key + secret + passphrase).
- **Retail OAuth** (token-based).

The current model supports `apiKey` + `apiSecret`.
We need to confirm **which Coinbase API** we’ll target and whether a passphrase or private key is required.

**Decision needed before implementation**:
1. Which Coinbase API product are we integrating (Advanced Trade vs legacy Pro)?
2. Does it require a third credential?
3. Which endpoint returns balances with stable structure?
4. Handling of fiat balances (USD/EUR):
   - Option A: Keep as crypto positions (matches Binance pattern).
   - Option B: Map fiat balances to `cash` positions (requires extra logic).

Decision taken for implementation: **Coinbase Advanced Trade (api.coinbase.com)** using API key + **EC private key (JWT)**. No passphrase required. This uses JWT signing with `iss: "cdp"`, `sub: <API key>`, and a `uri` claim matching the request.

## Proposed File Touch List
- `src/app/api/cex/coinbase/route.ts` (new)
- `src/services/providers/cex-provider.ts`
- `src/services/providers/cex-provider.test.ts`
- `src/app/crypto/accounts/page.tsx`
- `src/types/index.ts` (only if extra credential needed)
- `src/store/portfolioStore.ts` (only if new credential fields added)

## Implementation Steps (Once Decisions Confirmed)
1. Add Coinbase API proxy route with correct signing/auth.
2. Add `fetchCoinbaseBalances` and wire into `fetchCexAccountPositions`.
3. Update UI to mark Coinbase supported and validate against Coinbase proxy.
4. Update tests for provider + UI behavior.
5. Run targeted tests (`npm run test:domain` or provider tests once Node matches required version).

## Risks / Considerations
- Incorrect auth scheme causes silent failures; needs strict error messaging.
- Coinbase API may rate-limit; consider caching or backoff if needed later.
- If additional credentials are required, ensure they’re stored locally and not logged.

---
**Next**: Confirm Coinbase API variant and required credentials, then implement.
