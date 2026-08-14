---
name: composer opaque dock
description: Opaque bg block sits behind the prompt bar only — generation cards above it stay uncut
type: feedback
---

# Composer dock is an opaque background block

The **prompt bar** sits on a solid `bg-background` block so transcript
lines cannot pass under the glass input. That block is
`[data-composer-prompt-slot] > [data-composer-bg-block]`.

Above the stack, `[data-composer-top-fade]` is a gradient: transparent
at the top (last message / card title stay readable) and
`from-background` at the prompt edge. Below the stack,
`[data-composer-bottom-scrim]` is solid `bg-background` so the canvas
wallpaper cannot leak under the dock padding.

Generation, status, and follow-up cards stay in
`[data-composer-top-stack]` **above** the bar. Do not paint a full-height
opaque slab over the whole composer stack or the canvas dock — that cuts
"Generate Image" and covers the last message.

**Why:** Vincent asked for a Cursor-style footer under the input, then
the full-stack slab clipped the generation card. He then asked for a
gradient: text visible at the top, black at the bottom.

**How to apply:** Keep the opaque block on the prompt bar only. Turn
`showTopFade` on for the agent prompt bar and the empty-state composer.
Top cards use their own `bg-background`. The canvas
`workspace-composer-dock` stays free of solid `bg-background`. A
full-width `[data-composer-dock-fade]` (transparent at the top, black at
the bottom) covers wallpaper in the dock padding and keeps the last
transcript line readable. Do not put `bg-background` on the full-width
dock.
