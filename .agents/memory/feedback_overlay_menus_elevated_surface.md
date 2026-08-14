---
name: overlay menus elevated surface
description: Dropdowns and popovers use bg-secondary + shadow-dropdown, never elevated or canvas
type: feedback
status: active
last_verified: 2026-08-14
topics: [ui, dropdown, popover, design-system]
---

# Overlay menus use the secondary surface

Floating menus (dropdown, popover, select content, model picker) use
`overlayMenuSurfaceClassName` (`bg-secondary` + `shadow-dropdown`). That is
`#0c0d10` — darker than `bg-tertiary` (`#131518`) and `bg-elevated`
(`#1a1c21`). `--popover` matches secondary so `bg-popover` cannot punch an
elevated hole through the panel.

**Why:** `bg-elevated` and `bg-tertiary` still read as a lifted gray slab on
the `#050607` page. Vincent wanted the menu closer to the canvas black.

**How to apply:**

- Put overlay chrome on `DropdownMenuContent`, `PopoverContent`, and
  `PopoverPanelContent` via `overlayMenuSurfaceClassName` in
  `packages/ui/src/primitives/field-control.ts`.
- Do not override floating menus with `bg-elevated`, `bg-tertiary`, `bg-card`,
  `bg-primary`, or `gen-shell-panel`.
- Keep inner picker chrome on `bg-secondary` so nested lists match the panel.
- Studio `--popover` stays `225 14% 5%` (`#0c0d10`), not elevated.
