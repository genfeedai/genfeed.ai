---
name: design-system-guard
description: Use when creating, editing, reviewing, or validating UI design across Genfeed.ai apps/packages. Enforces the root DESIGN.md contract, shared tokens, component consistency, and @google/design.md validation.
version: 1.0.0
tags:
  - design-system
  - design-md
  - ui
  - tokens
  - consistency
  - validation
---

# Design System Guard

Use this skill for UI work that can affect visual consistency anywhere in the monorepo: app, website, docs, desktop, mobile, extensions, `packages/ui`, `packages/styles`, `packages/workflow-ui`, or shared Tailwind/theme code.

## Canonical Sources

Read these before changing UI tokens or broad component styling:

- `DESIGN.md` — agent-readable visual identity and token contract.
- `packages/ui/web-tokens.scss` — semantic theme variables and invariant tokens.
- `packages/styles/globals.scss` — Tailwind v4 theme mapping and global UI behavior.
- `packages/styles/shadcn-theme.scss` — shadcn-compatible variables, overlays, platform colors, effects.
- `packages/next-config/tailwind.config.base.ts` — shared Tailwind preset and radius/platform tokens.

## Required Workflow

1. Identify which design surface is being changed: tokens, primitive components, app-specific composition, workflow UI, public website, mobile, or extension UI.
2. Find at least three existing examples of similar UI before adding a new pattern. Prefer shared primitives and local conventions over new abstractions.
3. Align new visual choices with `DESIGN.md`. If the intended design direction does not fit, update `DESIGN.md` in the same change and explain why.
4. Keep implementation tokens sourced from existing CSS variables, Tailwind theme tokens, or shared constants. Do not hard-code broad palettes in components.
5. For production TSX controls, use `@ui/primitives/*` rather than raw form/control HTML.
6. Run `bun run design:lint` after editing `DESIGN.md`.

## Validation

Always run:

```bash
bun run design:lint
```

Also run the narrowest relevant UI verification for the touched package, such as tests, type-check, Storybook/build, or Playwright screenshots when visual behavior changed.

## Update Rules

- `DESIGN.md` describes the whole repository, not a single app.
- It should mirror the current implemented design system; it is not a place for speculative redesigns.
- Tokens in `DESIGN.md` must stay compatible with `@google/design.md`.
- If adding a new semantic color, radius, spacing step, or typography role, add it first to the real token source, then reflect it in `DESIGN.md`.
- If a component pattern becomes shared across apps, move the implementation to `packages/ui` or the appropriate shared package and document the pattern in `DESIGN.md`.

## Anti-Patterns

- Adding an app-local theme system for a repo-wide concern.
- Making product UI look like a landing page.
- Using platform colors as global accents.
- Nesting cards inside cards or wrapping whole page sections in decorative cards.
- Adding raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, `<table>`, `<hr>`, `<details>`, or `<summary>` in production TSX.
