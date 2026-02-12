# UX Rules

> These principles apply to all new features and UI changes. Existing code may not fully implement all of them — prioritize applying them to new work.

## Core Principle: Minimize User Actions

Every interaction should be designed around the user's goal. Identify what they're trying to accomplish and get them there with the fewest possible steps.

### Pre-fill Everything
- Every field that can be inferred from context MUST be pre-filled
- Dropdowns always have a default selection — never show a blank/empty state when a reasonable default exists
- When editing an existing item, all fields start with current values (not empty)
- CMD-K parsed values pre-fill modals — user only corrects what the LLM got wrong

### Smart Defaults
- Account selection: auto-select by asset type (crypto→first wallet, stocks→first brokerage, cash→matched account)
- Prices: auto-fill from current market price when available
- Dates: default to today
- Asset types: infer from symbol (BTC→crypto, AAPL→stock, EUR→cash)

### Reduce Confirmation Friction
- One-click confirmations when all data looks correct
- Show before→after previews so users can verify at a glance without reading every field
- Don't ask users to re-enter information the system already knows
- Don't add unnecessary intermediate steps (e.g., "Are you sure?" dialogs for reversible actions)

### Progressive Disclosure
- Show only the fields relevant to the current action
- Hide advanced/optional fields behind expandable sections
- Error states should highlight exactly what needs fixing — don't make users hunt

### Zero-State Guidance
- Empty states suggest the most common next action
- Example commands show real values when possible (not generic placeholders)
- Recently used commands/actions surface first
