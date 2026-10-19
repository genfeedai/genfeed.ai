---
name: composer outer shadow
description: Prompt bars carry no shadow at all (no outer lift, no inset ring); the surface is glass fill + border + radius only
type: feedback
last_verified: 2026-10-19
---

# Composer has no shadow

Every prompt bar (Agent, Studio, Library, post composer, modals, extension) renders
`PROMPT_BAR_SURFACE_CLASS` with no `shadow-*` utility. `shadow-composer` and
`shadow-composer-strong` were deleted.

**Why:** Vincent called the outer `--shadow-lg` on the Library prompt bar
"disgusting" (2026-10-19). It replaced an earlier inset hairline that read as a
boxed slab, so neither ring nor lift belongs on the bar.

**How to apply:** Do not add a shadow to the shared constant or at a call site;
`scripts/check-composer-surface-styling.ts` already rejects `shadow-` on
`PromptBarComposer`/`PromptBarShell` call sites. Cards, dropdowns and dialogs keep
their inset hairlines.
