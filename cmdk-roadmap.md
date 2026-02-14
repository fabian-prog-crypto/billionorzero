# CMD-K Roadmap

Last updated: 2026-02-14
Status: planning

## Objective

Make CMD-K robust for unstructured user input by combining:

- LLM command selection from a deterministic command catalog.
- Deterministic semantic normalization and entity resolution before execution.
- A single execution plan path used by API and UI confirmation.

## Non-Goals

- No asset-class-specific command forks as the default architecture.
- No business-logic inference inside modal components.
- No multi-layer fallback guessing that mutates state without deterministic target resolution.

## Design Principles

- One command catalog source for LLM schema + backend validation.
- One semantic normalizer source for language operators (`set` vs `add`, `worth of`, etc.).
- One entity resolver source for symbol/account/currency matching.
- One execution planner source for mutation preconditions and target ids.
- Backward-compatible command phrasing support via deterministic aliases, not ad-hoc fallback branches.

## Target Architecture

1. `CommandCatalog`
- Finite command ids and typed args.
- Generated tool schema for LLM.

2. `CommandFrame` (normalized intent)
- `commandId`
- `mode` (`delta` | `absolute`)
- `target` (`symbol`, `account`, `currency`, optional `positionId`)
- `quantity` (`units` | `notional`)
- `date`
- `metadata` (`confidence`, `warnings`)

3. `EntityResolver`
- Deterministic outcomes: `matched`, `ambiguous`, `unresolved`.
- No silent near-match auto-creation.

4. `ExecutionPlan`
- Fully resolved mutation plan with ids + invariants.
- If unresolved/ambiguous, return clarification state (no mutation).

5. `Confirmation UI`
- Renders and edits the `ExecutionPlan`.
- Does not reinterpret intent or invent target entities.

## Current vs Target

- Current:
  - Regex intent slicing + LLM tool calls + distributed fallback logic across API route, mapper, and modal.
- Target:
  - LLM chooses command id + args.
  - Deterministic normalize -> resolve -> plan.
  - UI confirms plan, then executes.

## Implementation Phases

## Phase 0: Contract Freeze

- Add typed contracts:
  - `CommandDefinition`
  - `CommandFrame`
  - `ResolutionResult`
  - `ExecutionPlan`
- Map current command flow to these interfaces.
- Acceptance:
  - Contracts compile and are referenced by CMD-K pipeline entry points.

## Phase 1: Catalog-Driven LLM Output

- Generate tool schema from `CommandCatalog`.
- Require a single command choice with typed args.
- Add parser for backward-compatible legacy tool payloads.
- Acceptance:
  - Existing command examples still parse.
  - No increase in LLM call count for happy path.

## Phase 2: Semantic Normalizer

- Add deterministic normalizer:
  - `balance =` / `set ... to` -> `mode=absolute`
  - `add` / `deposit` / `top up` -> `mode=delta`
  - `$X worth of` / `for $X` -> `quantity=notional`
- Remove conflicting semantic fallbacks from route and modal.
- Acceptance:
  - Same input + same state always yields same `CommandFrame`.

## Phase 3: Shared Entity Resolver

- Centralize account/symbol/currency resolution.
- Return disambiguation payload when ambiguous.
- Block auto-create on near-match by default.
- Acceptance:
  - No unresolved commands mutate state.
  - Duplicate-account creation path is gated by explicit policy.

## Phase 4: Execution Planner Integration

- Build resolved `ExecutionPlan` in API route.
- Move confirm modal to plan-driven rendering.
- Route all confirmed mutations through one planner/executor.
- Acceptance:
  - API + modal execute identical mutation plan for same input.

## Phase 5: Cleanup and Hardening

- Delete duplicated intent/fallback logic from legacy call sites.
- Keep compatibility adapters where required.
- Acceptance:
  - No critical behavior regressions in existing CMD-K suite.

## QA Strategy

## Functional QA

- Equity notional buy:
  - `bought 50k USD AAPL yesterday`
  - `bought 50k USD MSFT yesterday`
  - Verify equity context, deterministic quantity behavior, and plan validity.
- Account reuse:
  - `Add 5000 USD to Millenium` (exact, case variant, near-match variants).
  - Verify no duplicate-account creation unless explicitly allowed.
- Set vs add semantics:
  - `Revolut USD balance = 283293`
  - `Add 5000 USD to Revolut`
  - Verify `absolute` vs `delta` behavior in produced `ExecutionPlan`.

## Regression QA

- Replay existing intent-router, action-mapper, and confirm modal tests.
- Real DB temp-clone replay (`PORTFOLIO_DB_PATH`) to validate planner behavior without touching prod DB.
- Ambiguity tests:
  - similarly named accounts (`Revolut`, `Revolut Broker`)
  - missing quote data
  - unknown symbols.

## Invariant QA

- Determinism: identical inputs produce identical normalized frames/plans.
- Safety: `ambiguous` and `unresolved` states never mutate.
- Consistency: confirmation screen mirrors exact execution plan fields.

## Performance QA

- Track median and p95 command latency before/after rollout.
- Guardrails:
  - one LLM call in happy path
  - deterministic normalization/resolution overhead remains low (single-digit ms target)
  - no extra quote fetch before frame normalization.

## Rollout Plan

1. Ship in shadow mode:
- Build `CommandFrame` and `ExecutionPlan` alongside current path.
- Compare outputs and log diffs.

2. Enable for internal/alpha users:
- Fail-safe to legacy path on planner errors.

3. Progressive rollout:
- Ramp by feature flag.
- Monitor ambiguity rate, fallback rate, and mutation-error rate.

4. Full cutover:
- Remove legacy duplicate inference branches.

## Success Metrics

- Zero incorrect asset-context switches for equity tickers in buy flows.
- Zero unintended duplicate account creations from near-match account strings.
- Zero set-vs-add semantic regressions in balance commands.
- No regression in p95 CMD-K latency on happy path.
