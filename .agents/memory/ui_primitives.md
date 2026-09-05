---
name: Always use @ui/primitives components, never raw HTML
description: Genfeed blocks raw HTML elements (button, input, textarea, select, dialog, table, hr, etc.) via scripts/ui/control-guard.ts — use @ui/primitives/* instead
type: feedback
---

In this repo, **never write raw `<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`, `<table>`, `<details>`, `<summary>`, `<progress>`, or `<hr>` elements** in production `.tsx` files. They are blocked by `scripts/ui/control-guard.ts` — the single canonical raw-control scanner that replaced the old `check-raw-button-usage.ts`, `check-raw-ui-controls.ts`, and `lint-no-raw-html.sh`. It runs pre-commit via lint-staged (`lint-staged.config.mjs`) and repo-wide in CI via `bun run check:ui-guards`.

**Use `@ui/primitives/*` instead:**
- `<button>` → `Button` from `@ui/primitives/button`
- `<input>` → `Input` from `@ui/primitives/input`
- `<textarea>` → `Textarea` from `@ui/primitives/textarea`
- `<select>` → `Select` from `@ui/primitives/select`
- `<dialog>` → `Dialog` from `@ui/primitives/dialog`
- `<table>` → `Table` from `@ui/primitives/table`
- `<hr>` → `Separator` from `@ui/primitives/separator`

**Button component gotchas:**
- For "unstyled" usage (e.g. replacing a clickable `<div>`), use `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}` + custom `className`
- Never nest `Button` inside `Button` — invalid HTML. Restructure as siblings (e.g. absolute positioning)
- Button is a `forwardRef<HTMLButtonElement>`, takes `onClick`, `onKeyDown`, `tabIndex`, and spreads `...props`

**When converting a clickable div to a real button, check for nested buttons first.** If the original div contains another Button (e.g. a Delete action), don't convert the outer to a button — refactor to put both as siblings instead, or the HTML becomes invalid.

**Why:** Enforces design system consistency and a11y. User has called out raw HTML violations multiple times.

**How to apply:** Before adding any `<button>`, `<input>`, `<dialog>`, etc., check `packages/ui/src/primitives/` for the corresponding component. If a div with `role="button"` would be the natural choice, use `Button` with `variant={ButtonVariant.UNSTYLED}` instead. Exclusions (primitives, editors, tests, mocks, storybook) live in the single `ALLOWLIST` in `scripts/ui/control-guard.ts`.

## Shared page UX (verified 2026-09-05)

**Why:** Pages were using the same primitives while independently rebuilding headers,
error panels, selection bars, and search behavior.

**How to apply:**
- Page headers and filters belong in the existing Container/SectionTopbar slots.
  Analytics children register toolbar content through setToolbarNode; the parent
  layout owns the page frame.
- List failures use AppTable's error prop (title, optional description, onRetry).
  AppTable shows a full error for missing data and an inline error above retained
  rows after a failed refresh. Non-table regions use ErrorFallback, with compact
  enabled when existing content remains visible.
- Return the retry promise so ErrorFallback can show pending feedback. Preserve
  pagination controls when loading or empty results still need navigation.
- Shared SelectionToolbar owns selection count, live announcements, clear control,
  and wrapping. Domain adapters supply actions. Preserve selection semantics and
  let users clear selection while previously requested operations finish.
- Searchbar owns the named search input, accessible clear action, and focus
  restoration. Use ariaLabel for domain-specific search names. Sync debounced
  search from external filter changes without resetting locally typed text.
