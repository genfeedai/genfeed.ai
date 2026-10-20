---
name: composer opaque dock
description: Opaque bg block sits behind the prompt bar only — generation cards above it stay uncut
type: feedback
---

# Composer dock is an opaque background block

The **prompt bar** sits on a solid `bg-background` block so transcript
lines cannot pass under the glass input. That block is
`[data-composer-prompt-slot] > [data-composer-bg-block]`.

There is **no top fade**: `showTopFade` and `[data-composer-top-fade]` were
removed 2026-10-20 (Vincent: the gradient above the bar still read as a
shadow on the storyboard after the 2026-10-19 shadow removal).
`scripts/check-composer-surface-styling.ts` fails any shadow, gradient or fade
on the container and surface.

Generation, status, and follow-up cards stay in
`[data-composer-top-stack]` **above** the bar. Do not paint a full-height
opaque slab over the whole composer stack or the canvas dock — that cuts
"Generate Image" and covers the last message.

**Why:** Vincent asked for a Cursor-style footer under the input, then
the full-stack slab clipped the generation card. He then asked for a
gradient, and on 2026-10-20 rejected that too.

**How to apply:** Keep the opaque block on the prompt bar only. Never add a
fade, gradient or shadow above or around the bar. Top cards use their own
`bg-background`. The canvas `workspace-composer-dock` stays free of solid `bg-background`. A
full-width `[data-composer-dock-fade]` is **padding-height only** (`h-8`):
black at the dock bottom so wallpaper cannot leak, transparent above.
A tall dock fade (`h-28`) sits at `z-20` over the transcript and paints
the last message black. Do not put `bg-background` on the full-width
dock.
