---
name: Always use @ui/primitives components, never raw HTML
description: Genfeed blocks raw HTML elements (button, input, textarea, select, dialog, table, hr, etc.) via scripts/lint-no-raw-html.sh — use @ui/primitives/* instead
type: feedback
---

In this repo, **never write raw `<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`, `<table>`, `<details>`, `<summary>`, `<progress>`, or `<hr>` elements** in production `.tsx` files. They are blocked by `scripts/lint-no-raw-html.sh` which runs as a pre-commit hook.

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

**How to apply:** Before adding any `<button>`, `<input>`, `<dialog>`, etc., check `packages/ui/src/primitives/` for the corresponding component. If a div with `role="button"` would be the natural choice, use `Button` with `variant={ButtonVariant.UNSTYLED}` instead. Exclusions (primitives, editors, tests, mocks, storybook) are hardcoded in `scripts/lint-no-raw-html.sh`.
