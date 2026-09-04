---
name: composer outer shadow
description: Docked prompt bar lifts with outer --shadow-lg only — never an inset or 1px ring hairline
type: feedback
last_verified: 2026-09-04
---

# Composer uses outer ambient shadow, not a boxed hairline

`shadow-composer` / `shadow-composer-strong` are **outer** `--shadow-lg` only.
Do not stack `inset 0 0 0 1px` (or an outer 1px ring) on the docked prompt bar.

**Why:** The inset `--border` hairline on the glass composer reads as a rounded
slab around "Ask for help with…". Vincent asked for an outer lift, not a block.

**How to apply:** Keep the named utilities. Change their composition in
`packages/styles/globals.css`, not a one-off class on `PROMPT_BAR_SURFACE_CLASS`.
Cards, dropdowns, and dialogs still use inset hairlines. The composer is the
exception, documented in `DESIGN.md`.
