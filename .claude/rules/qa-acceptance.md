# Acceptance Criteria

Definition of "done" for any feature or change. Split into **Blocking** (must fix before merge) and **Advisory** (flag but don't reject).

## Blocking

These are auto-reject. Do not merge until all are resolved.

- [ ] Tests pass: `npx vitest run` and `npx playwright test`
- [ ] Build succeeds: `npm run build` (catches TypeScript errors)
- [ ] Lint clean: `npm run lint`
- [ ] Spec requirements met -- every requirement verified, not just happy path
- [ ] No security issues: unsanitized input, missing auth checks, secrets in code, XSS/injection vectors
- [ ] UI renders correctly at mobile (375px) and desktop (1440px)
- [ ] No `console.log`, debugging artifacts, or commented-out code left behind
- [ ] No `any` escape hatches in TypeScript
- [ ] Existing tests still pass (no regressions)
- [ ] `hideBalances` support: any new value display checks this store flag and shows `'••••'` when true
- [ ] DB backup intact: `portfolio-backup-11022026.json` must not be deleted, overwritten, or corrupted. After all changes, verify the backup file still exists and contains valid data (688 positions, 34 accounts).
- [ ] Test cases documented: after completing a feature, append test case descriptions to the feature's plan `.md` file (or create a `tests.md` section in it). Document what was tested, key scenarios covered, and any edge cases verified — so future readers know the test coverage intent without reading every test file.
- [ ] Browser verified: after any UI change, run `npm run dev` and visually confirm the affected pages render correctly in the browser. Do not rely solely on build/lint/test passing.

## Advisory

Flag these but don't reject. Fix if easy, note if not.

- [ ] Edge case tests present (empty states, boundary values, unexpected input, long strings, special characters)
- [ ] Error, loading, and empty states handled in UI (see `qa.md` for current patterns: `isRefreshing` flag for loading, `EmptyState` component, `{ error: string }` JSON for API errors)
- [ ] Bundle size increase < 50kb from new dependencies
- [ ] No performance issues (N+1 queries, unnecessary re-renders, missing indexes, main thread blocking)
- [ ] Code style consistent beyond what lint catches
- [ ] Keyboard navigation works
- [ ] Dark mode renders correctly
- [ ] Git hygiene: atomic commits, no unrelated changes, no large files

## The Meta-Check

Would you be comfortable merging this if you hadn't written it and only had 5 minutes to review? Clean diff + well-tested + PR explains "why" = pass.
