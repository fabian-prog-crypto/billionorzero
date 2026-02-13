# CMD-K Review (CMD-K Revolution)

## Metadata
- Worktree/branch: `CMD-K-Revolution` (fresh worktree from `main`).
- Focus: CMD-K architecture vs runtime behavior, usability gaps, and documentation alignment.
- Tests referenced: `npx playwright test e2e/command-palette` (existing e2e suite for the command palette).

## Findings

### High

#### HIGH-01: Structured query results never reach the palette
**Documentation** (`architecture.md:775-796`) describes the CMD-K flow as returning a `{ response, toolCalls[], mutations, pendingAction? }` payload and explicitly notes “Query result? → display in palette”. The associated components (`QueryResultView`, `CommandResult`) also exist to render structured `QueryResult`/`MutationPreview` data.

**Implementation** does not deliver on that expectation: `src/hooks/useCommandPalette.ts:43-215` defines `queryResult` state and exposes it, but the hook never inspects `chatResponse.toolCalls` or any `tool` output and never calls `setQueryResult`. All `toolCalls` processing is limited to navigation and mutation confirmation (lines 151-166), so every query still falls back to the raw `assistant` text. `src/components/CommandPalette.tsx:250-337` renders the `QueryResultView` only when `queryResult` is truthy—since the hook never populates that state and the API never returns a typed `QueryResult`, the UI branch is unreachable. There is also no conversion from the generic `toolCalls` payload to the `QueryResult`/`CommandResult` schema that lives in `src/services/domain/command-types.ts`.

**Impact**: CMD-K no longer delivers the deterministic, tabular/numeric outputs promised in the docs; structured metrics (exposure summaries, top positions, etc.) disappear behind the LLM’s conversational response. That also makes automated audits and predictable testing harder.

**Recommendation**: Add bridging logic in the chat hook (or API response) that consumes the first query tool call result, maps it to the `QueryResult` shape, and calls `setQueryResult`. The API should also surface enough metadata (tool name + sanitized result) so the hook can decide whether the result was a query, mutation preview, or navigation. Update the architecture doc/`CommandResult` definitions only after implementing the flow.

### Medium

#### MED-01: Intent routing still floods Ollama with 15 query tools
**Documentation** (`architecture.md:775-796`, especially “Phase 2”) promises that the intent router sends only 1–3 relevant tools to Ollama so the tool-call loop remains fast.

**Implementation** (`src/services/domain/intent-router.ts:4-100`) contradicts that claim. The query branch returns 15 tool IDs (`query_net_worth`, `query_portfolio_summary`, …, `query_risk_profile`), so `src/app/api/chat/route.ts` forwards 15 candidates every time a question-like phrase is detected. The LLM still receives almost the entire query registry, which negates the performance gain mentioned in the architecture doc.

**Impact**: Longer request times, higher Ollama CPU/latency, and more complex prompt handling even for simple lookups. It also makes the documented “1–3 relevant tools” claim inaccurate, which matters for onboarding and troubleshooting.

**Recommendation**: Narrow the query list down to the smallest subset that still answers the common cases (e.g., `query_net_worth`, `query_top_positions`, `query_portfolio_summary`). If more specialized queries are needed, fall back to a secondary classifier. Update the documentation so it remains in sync with the actual tool-count strategy.

## Recommendations & Next Steps
1. **Bridge tool output → `QueryResult`**: Extend `/api/chat` (or the hook) so that the first query tool call becomes a typed `CommandResult` payload. Update `useCommandPalette` to inspect that payload, populate `queryResult`, and fall back to the existing `llmResponse` if nothing structured arrives. Once the hook can render results, add a regression test that asserts `QueryResultView` is displayed for a known query (e.g., “what is my net worth?”).
2. **Limit query tools per intent**: Update `classifyIntent` to return a short list (1–3) per intent; validate in unit tests that a simple question only unlocks the subset described in the architecture doc. If necessary, add coverage in `intent-router` tests or the e2e spec to confirm the requested tool is the one that runs the query instead of rerunning the entire registry.
3. **Align documentation**: Once the new behavior is in place, refresh the CMD-K architecture section (`architecture.md`) so the narrative matches the actual payload structure (mentions of `QueryResult` + tool-count expectation). If the doc needs to describe the fallback to LLM text, make that explicit so readers aren’t misled.

## Roadmap: Advanced CMD-K Queries

The current query set is broad but not optimized for targeted analytics prompts. The next iteration should add dedicated query capabilities for analytical questions such as:
- "How many stables do I have on Base?"
- "What is my exposure to USD?"

### Scope
- Add chain-aware stablecoin queries (count + value, with optional chain filter).
- Add currency-exposure queries that aggregate fiat cash + stablecoins by underlying currency (for example USD across USD cash, USDC, USDT, USDe).
- Return deterministic, structured outputs first (numbers/tables), with optional natural-language summary second.
- Preserve brokerage settlement invariant: equities and brokerage cash (USD by default) must stay on the same account ID, and equity buy/sell cash updates must be applied to that same brokerage account.

### Suggested Tooling Changes
- Introduce focused tools (or typed args on existing tools) for:
  - `query_stablecoins` with optional `chain`.
  - `query_currency_exposure` with optional `currency`.
- Keep the default query tool slice small; route advanced prompts directly to these tools via intent keywords (`stable`, `stables`, `on base`, `exposure to usd`, etc.).

### Performance Guardrails
- Avoid passing all query tools for analytics prompts; send only the selected specialized tool(s).
- Keep one tool-call round-trip for query resolution whenever possible.
- Limit response payload size to the fields needed for rendering in CMD-K.
- Defer performance step `2`: short-circuit pure query responses so the API can return structured tool results directly without waiting for a second LLM prose pass.

### Validation Plan
- Unit tests for intent routing of advanced prompts.
- Route-level tests for tool output shape and values.
- E2E CMD-K tests asserting deterministic rendering for the two canonical examples above.

### Sequencing
1. Implement specialized query tool contracts.
2. Wire intent-routing patterns for advanced analytics prompts.
3. Implement deferred performance step `2` (query short-circuit: skip second LLM round for deterministic query tools).
4. Bridge outputs into `QueryResultView`.
5. Add tests and update `architecture.md` to reflect final behavior.

## Testing/Validation
- Existing CLI: `npx playwright test e2e/command-palette` already touches happy-path navigation, mutation confirmation, and natural-language variations but currently only inspects the textual response. Extend that suite by mocking a query tool result and asserting the palette renders `QueryResultView` (or at least sets `queryResult`).
- Add a unit test for `intent-router` to enforce the 1–3 tool budget for queries (and maybe a regression that guards against Javascript regex expanding the list by mistake).

## Assumptions
- The implementation review is documentation-only; no runtime changes are committed in this worktree.
- Ollama is expected to respond with structured data via tool calls—fixing the hook/UI is the critical path for delivering the documented experience.
