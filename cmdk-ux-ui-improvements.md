# CMD-K UX/UI Improvements

## Context
CMD-K is now deterministic and should remain fast. This doc proposes UX/UI upgrades that feel modern and delightful while preserving performance and extensibility as new asset classes or tools are added.

## Goals
- Make CMD-K feel premium, modern, and confident on first open.
- Reduce cognitive load and speed up common actions.
- Keep latency at or below current p95; no new heavy render or network costs.
- Ensure new asset classes and query tools appear automatically without manual UI changes.

## Non-Goals
- Changing core command semantics or backend architecture.
- Adding new asset classes as part of this UX pass.

## UX Priorities
1. **Recent commands are truly recent**: only show last 3, in order, and only if they are still valid.
2. **Instant clarity**: user should see examples, categories, and intent without reading a long list.
3. **Delight without distraction**: light motion, better hierarchy, improved empty states.
4. **Performance first**: no heavier than current rendering.

## Proposed UX Changes
### Recents
- Show only last 3 commands in `RECENT` group.
- If fewer than 3 exist, show what’s available; never show a blank group.
- Add small timestamp hints (e.g., “2h ago”) if cheap to compute client-side; skip if it adds rendering cost.

### Prompting and Examples
- Rotate or tier examples by category:
  - Primary (first row): “Buy $10k AAPL”, “Add $2k cash”, “Exposure % USD”.
  - Secondary (subtext or pill group): “Exposure % USD”, “Top positions”, “Debt summary”.
- Add “Try typing…” as light helper copy above the input on first open only.
- Use short, literal examples that reflect exact supported commands. Favor compact phrasing over “Show …”.
  - Good: “Exposure % USD”, “USD exposure %”, “Top positions”.
  - Avoid: long verb phrases that wrap on desktop widths.

### Preview Feedback
- While typing, emphasize the selected item with stronger color, outline, and scale (subtle, 1–2%).
- Query items should show a one-line summary on hover/focus (e.g., “Breaks down exposure by asset class”).

### Confirmation Flow (Mutations)
- Reassure the user with a clean action summary before the modal opens:
  - “Buy $10,000 AAPL — Confirm details in the next step”.
- Keep any validation or missing-field prompts short and centered in the palette.

## UI Direction
### Layout
- Make CMD-K wider on desktop: target 720–820px max width with a modern proportion.
- Increase padding and spacing between groups to improve scanability.
- Ensure mobile width remains unchanged and readable.

### Visual Style
- Softer panel with subtle depth, using a light blur or shadow layer.
- Crisp, readable typography: larger input, lighter list items, stronger headings.
- Category tags feel like modern pills (rounded, low-contrast background, bold label).

### Colors
- Use clear contrast for selection.
- Keep a single accent color for highlights and active states.
- Avoid overly saturated colors or gradients that interfere with readability.

### Motion
- Fade-in on open (60–90ms) to feel ultra-snappy.
- Subtle stagger for list items (optional, only if cheap).
- Selection state transitions should be instant or near-instant.

## Performance Guardrails
- No extra network calls during palette open.
- No heavy animations or layout thrashing.
- No dynamic measurement loops; prefer static layout.
- Keep render under current baseline. Do not introduce more than one extra React re-render per keystroke.

## Extensibility
- All new tools and asset classes should appear via existing mapping.
- UI should be category-driven, not hardcoded to specific tools.
- Recents and suggestions should be derived from tool metadata, not manual lists.

## Accessibility
- Maintain keyboard-only flow.
- Ensure focus ring is visible and accessible.
- Check contrast for selected and disabled states.

## Implementation Sketch
- `src/components/CommandPalette.tsx`
  - Limit recents to 3.
  - Add example rows in header or empty state.
  - Light helper text on first open.
- `src/app/globals.css`
  - Adjust width, padding, and typography.
  - Update selection styles and category tags.
  - Add light animation for open.

## Testing Plan
- Update `e2e/command-palette.spec.ts` to assert:
  - RECENT shows max 3 items.
  - Example text appears on first open.
  - Palette width class is present.
- Run `npx playwright test e2e/command-palette`.

## Open Questions
- Should “RECENT” include failed commands or only successful actions?
- Should example list be static or adaptive based on portfolio contents?
- Do we want a “tip of the day” style prompt, or keep it consistent for determinism?
