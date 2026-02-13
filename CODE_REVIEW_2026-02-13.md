# Code Review — BillionOrZero (2026-02-13)

## Metadata
- Review date: 2026-02-13
- Repository: `billionorzero`
- Scope: architecture consistency, unused/legacy surface, security posture, robustness practices
- Method: static code inspection + config inspection + command-based quality checks
- Change policy for this review: documentation-focused; no runtime code paths modified

## Executive Summary
- The highest-risk gap is API trust boundary design: token minting and data endpoints are not consistently protected.
- Auth and persistence flows are internally inconsistent, which can cause silent data drift between UI and server state.
- Lint/typecheck/test workflows are not aligned, so quality signals conflict and allow regressions through.
- Versioning and migration signals are inconsistent across storage, backup, and restore paths.
- Documentation is materially behind implementation (README and environment/config guidance).
- The platform is functional for local usage, but not robustly specified for hardened or multi-user deployment.

## Findings

### Critical

#### CRIT-01: Token minting is unauthenticated and token signing uses a static embedded secret
**What**
- `POST /api/auth/token` issues a session token without validating user/session state.
- Token signatures are generated with a hardcoded secret embedded in source.

**Why it matters**
- Any caller able to reach the endpoint can mint valid tokens.
- A static secret in source weakens operational security and secret rotation practices.

**Evidence**
- `src/app/api/auth/token/route.ts:4`
- `src/lib/session-store.ts:6`
- `src/lib/session-store.ts:32`
- `src/lib/session-store.ts:39`

**Recommendation (documentation-level)**
- Add a `docs/SECURITY_MODEL.md` that explicitly defines:
- Authentication preconditions for token issuance.
- Secret management policy (source prohibition, rotation, env/runtime injection).
- Trust boundaries for localhost-only vs network-exposed operation.

#### CRIT-02: Sensitive data endpoints are outside middleware protection scope
**What**
- Middleware protects `/api/portfolio/*` and `/api/chat`, but not `/api/db`, `/api/backup`, or `/api/debug`.

**Why it matters**
- Portfolio data read/write and backup retrieval exist on routes not covered by the current auth gate.

**Evidence**
- `src/middleware.ts:4`
- `src/middleware.ts:34`
- `src/app/api/db/route.ts:37`
- `src/app/api/db/route.ts:66`
- `src/app/api/backup/route.ts:17`
- `src/app/api/backup/route.ts:59`
- `src/app/api/debug/route.ts:4`

**Recommendation (documentation-level)**
- Add an API auth matrix document (`docs/API_SURFACE.md`) that lists every route, required auth, data sensitivity, and intended exposure.
- Add explicit “must be protected” criteria for stateful and diagnostic routes.

### High

#### HIGH-01: Sync/auth mismatch can silently desynchronize persisted state
**What**
- Client auto-sync posts to `/api/portfolio/sync` without Authorization header.
- Middleware requires bearer auth for `/api/portfolio/*`.
- Sync failures are swallowed.

**Why it matters**
- Server-side state used by command/query features can diverge from UI state without user-visible errors.

**Evidence**
- `src/hooks/useDbSync.ts:40`
- `src/hooks/useDbSync.ts:44`
- `src/middleware.ts:20`
- `src/app/api/portfolio/sync/route.ts:11`

**Recommendation (documentation-level)**
- Define a “data consistency contract” in `docs/PERSISTENCE_CONTRACT.md`:
- Required auth semantics for sync writers.
- Retry/error visibility policy.
- Definition of source-of-truth precedence on failure.

#### HIGH-02: Security posture is predominantly client-side and should be documented as such
**What**
- App auto-authenticates when no passkey exists.
- Credential state and API token are managed in localStorage.

**Why it matters**
- This is acceptable for local single-user workflows but not equivalent to hardened server-side auth.

**Evidence**
- `src/components/AuthProvider.tsx:27`
- `src/store/authStore.ts:32`
- `src/store/authStore.ts:76`
- `src/lib/passkey.ts:60`
- `src/lib/passkey.ts:67`

**Recommendation (documentation-level)**
- Add deployment profiles to `docs/SECURITY_MODEL.md`:
- Profile A: local single-user/trusted host.
- Profile B: shared/remote deployment requirements and unsupported assumptions.

#### HIGH-03: Lint quality gate currently fails with significant rule violations
**What**
- `npm run lint` reported 48 errors and 90 warnings during review.
- Categories include explicit `any`, hook rule violations, setState-in-effect, and unused code.

**Why it matters**
- Code health and maintainability degrade; latent runtime bugs are more likely.

**Evidence**
- `src/app/api/debank/protocols/route.ts:41`
- `src/components/LoginScreen.tsx:39`
- `src/components/modals/AddWalletModal.tsx:41`
- `src/services/providers/crypto-price-service.ts:315`
- `src/services/providers/wallet-provider.ts:800`

**Recommendation (documentation-level)**
- Add `docs/QUALITY_GATES.md` with:
- Mandatory local and CI commands.
- Fail/waiver policy.
- Error-budget approach for reducing current lint debt.

### Medium

#### MED-01: Typecheck and test workflows are inconsistent
**What**
- Tests pass under Vitest globals, but standalone `tsc --noEmit` fails on test globals/types.

**Why it matters**
- Teams receive conflicting build signals and may merge code without coherent type safety criteria.

**Evidence**
- `tsconfig.json:25`
- `vitest.config.ts:11`
- `src/__tests__/setup.ts:15`
- `src/__tests__/setup.ts:22`

**Recommendation (documentation-level)**
- In `docs/QUALITY_GATES.md`, define canonical typecheck strategy:
- app-only typecheck scope vs test-inclusive scope,
- and exact command set required for merge readiness.

#### MED-02: Store/backup versioning is inconsistent across persistence paths
**What**
- Store/db use version 13 while backup/import flows still reference version 10 semantics.

**Why it matters**
- Restore/migration behavior can be brittle and hard to reason about during incidents.

**Evidence**
- `src/store/portfolioStore.ts:342`
- `src/app/api/portfolio/db-store.ts:36`
- `src/hooks/useAutoBackup.ts:7`
- `src/app/settings/page.tsx:183`
- `src/app/settings/page.tsx:215`

**Recommendation (documentation-level)**
- Add migration/version governance to `docs/PERSISTENCE_CONTRACT.md`:
- single canonical version source,
- backward compatibility window,
- restore compatibility checklist.

#### MED-03: Environment configuration docs do not match runtime behavior
**What**
- `.env.example` suggests server-side API key flow.
- Actual config loading is localStorage-centric in client-managed config paths.
- No `process.env` usage was found in `src`.

**Why it matters**
- Setup confusion increases operational errors and support load.

**Evidence**
- `.env.example:1`
- `.env.example:12`
- `src/services/config/service-config.ts:53`
- `src/services/config/service-config.ts:56`
- `src/services/config/service-config.ts:110`

**Recommendation (documentation-level)**
- Add `docs/CONFIGURATION.md` clarifying:
- which settings are localStorage-based,
- which are server/runtime env-based (if any),
- and recommended key-handling patterns.

#### MED-04: README is stale and no longer describes the product
**What**
- Root README is still default Next.js boilerplate and omits platform-specific architecture and operations.

**Why it matters**
- Onboarding and handoffs are inefficient; intended architecture is not discoverable.

**Evidence**
- `README.md:1`
- `README.md:23`

**Recommendation (documentation-level)**
- Replace README with project-specific overview, architecture links, local runbook, and quality gate commands.

### Low

#### LOW-01: Unused and legacy surface area indicates incomplete cleanup
**What**
- Multiple unused symbols/legacy aliases and compatibility routes remain.

**Why it matters**
- Increases cognitive overhead and slows refactoring.

**Evidence**
- `src/components/PortfolioProvider.tsx:16`
- `src/app/crypto/accounts/page.tsx:20`
- `src/app/equities/accounts/page.tsx:15`
- `src/app/stocks/page.tsx:10`

**Recommendation (documentation-level)**
- Add `docs/DEPRECATION_POLICY.md` with lifecycle stages: introduced, deprecated, removed; plus cleanup SLAs.

#### LOW-02: Sensitive backup artifact exists at repository root
**What**
- `portfolio-backup-11022026.json` in root appears to contain detailed portfolio/account-linked data.

**Why it matters**
- Data leakage/privacy risk during collaboration or repo distribution.

**Evidence**
- `portfolio-backup-11022026.json:1`
- `.gitignore:33`

**Recommendation (documentation-level)**
- Add a data-handling section in `docs/SECURITY_MODEL.md`:
- prohibited artifacts in repo root,
- scrub/redact policy for sample data,
- review checklist before sharing.

#### LOW-03: Debug logging is verbose in production paths
**What**
- Several services emit detailed logs around config and refresh behavior.

**Why it matters**
- Can leak sensitive context and create noisy operational telemetry.

**Evidence**
- `src/services/config/service-config.ts:65`
- `src/services/portfolio-service.ts:53`
- `src/components/PortfolioProvider.tsx:43`

**Recommendation (documentation-level)**
- Add `docs/OBSERVABILITY.md` with log levels, redaction standards, and production-safe logging policy.

## Inconsistencies and Unused Aspects

### Cross-cutting inconsistencies
- Auth boundary mismatch between protected and unprotected API routes.
- Dual persistence flows (`/api/db` and `/api/portfolio/sync`) with different auth/error behavior.
- Version drift between core store and backup/import paths (13 vs 10).
- Documentation drift between env guidance and actual localStorage-driven configuration.

### Unused or legacy indicators
- Unused imports/variables surfaced broadly by lint.
- Compatibility redirect route (`/stocks` -> `/equities`) retained.
- Legacy aliases/selectors and partially deprecated migration baggage in store logic.

## Robustness and Best-Practice Recommendations

### Security and Access Control
- Publish a route-level authorization matrix and enforce documentation ownership for each endpoint group.
- Define token issuance and revocation semantics as an auditable contract.
- Define secret sourcing and rotation policy (including local dev exceptions).

### Data Integrity and Persistence
- Define one canonical source of truth for store version.
- Document migration compatibility policy and backup restore validation steps.
- Document sync failure handling and user-visible consistency guarantees.

### Developer Quality Gates
- Standardize one command set for CI and local pre-merge checks.
- Document accepted temporary waivers and expiration rules.
- Track lint debt reduction milestones by category.

### Observability and Incident Readiness
- Document logging redaction rules and prohibited fields.
- Define incident runbooks for: failed sync, corrupted db, failed restore, token/auth errors.
- Define health checks and expected outcomes for key data paths.

### Documentation Governance
- Assign ownership and review cadence for core docs:
- security model, API surface, persistence contract, quality gates, runbook.
- Require doc updates in PRs when changing auth, persistence, or API behavior.

## 30/60/90-Day Documentation Roadmap

### 30 Days
- Create `docs/SECURITY_MODEL.md`
- Create `docs/API_SURFACE.md`
- Create `docs/QUALITY_GATES.md`

### 60 Days
- Create `docs/PERSISTENCE_CONTRACT.md`
- Create `docs/CONFIGURATION.md`
- Create `docs/OPERATIONS_RUNBOOK.md` (backup/restore/recovery)

### 90 Days
- Create `docs/OBSERVABILITY.md`
- Create `docs/DEPRECATION_POLICY.md`
- Refresh `README.md` to point to all core docs and operational entrypoints

## Appendix: Validation Commands and Outcomes
- `npm test` -> passed (49 test files, 961 tests).
- `npm run lint` -> failed (48 errors, 90 warnings).
- `npx tsc --noEmit` -> failed (test globals/typecheck scope mismatch).

## Assumptions
- This review targets both current local usage and future hardening/production-readiness.
- Recommendations are documentation-first by request and intentionally avoid implementation details.
