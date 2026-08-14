---
name: overlay menus elevated surface
description: Dropdowns and popovers use bg-tertiary + shadow-dropdown, never the page canvas or bg-elevated
type: feedback
status: active
last_verified: 2026-08-14
topics: [ui, dropdown, popover, design-system]
---

# Overlay menus use the tertiary surface

Floating menus (dropdown, popover, select content, model picker) use
`overlayMenuSurfaceClassName` (`bg-tertiary` + `shadow-dropdown`). That is
darker than `bg-elevated` (`#1a1c21`) — `#131518`.

**Why:** A menu painted with `bg-card` or `gen-shell-panel` (page canvas)
disappears against the workspace. `bg-elevated` reads as a lifted gray slab;
Vincent wanted that darker.

**How to apply:**

- Put overlay chrome on `DropdownMenuContent`, `PopoverContent`, and
  `PopoverPanelContent` via `overlayMenuSurfaceClassName` in `packages/ui/src/primitives/field-control.ts`.
- Do not override floating menus with `bg-elevated`, `bg-card`, `bg-primary`,
  or `gen-shell-panel`. `gen-shell-panel` is in-page chrome, not a floating menu.
- Keep inner picker chrome on `bg-tertiary` so nested lists do not punch a
  canvas or elevated hole through the panel.
