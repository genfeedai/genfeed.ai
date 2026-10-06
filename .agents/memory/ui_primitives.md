---
name: Always use @ui/primitives components, never raw HTML
description: Genfeed blocks raw HTML elements (button, input, textarea, select, dialog, table, hr, etc.) via scripts/ui/control-guard.ts — use @ui/primitives/* instead
type: feedback
---

The raw-HTML-controls ban (`<button>`, `<input>`, `<dialog>`, etc. → `@ui/primitives/*`) is stated
in the root `CLAUDE.md` (always loaded) and enforced by `scripts/ui/control-guard.ts` pre-commit
(`lint-staged.config.mjs`) and in CI (`bun run check:ui-guards`); its `ALLOWLIST` is the single
exclusion list. Do not re-duplicate that content here — see `CLAUDE.md` → Frontend.

## Every surface uses shared components (Vincent, 2026-10-06)

**Why:** MCP previews shared colors while independently implementing their controls,
cards and typography. Token reuse alone did not satisfy the product UI contract.

**How to apply:** Always compose Genfeed UI from shared components. This includes
MCP widgets and other standalone/static surfaces, not only React pages. Use
the existing `@ui` React components and primitives; bundle them into standalone
MCP previews when needed. Component appearance, fonts,
states and accessibility belong to the shared UI package. Consumer CSS may
describe layout; do not hand-build visual substitutes or copy component CSS into
an app to approximate the design system. Extend the shared component when a
required variant is missing.

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
