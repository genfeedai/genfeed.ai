---
name: composer opaque dock
description: Opaque bg block sits behind the prompt bar only — generation cards above it stay uncut
type: feedback
---

# Composer dock is an opaque background block

The **prompt bar** sits on a solid `bg-background` block so transcript
lines cannot pass under the glass input. That block is
`[data-composer-prompt-slot] > [data-composer-bg-block]`.

Generation, status, and follow-up cards stay in
`[data-composer-top-stack]` **above** the bar. Do not paint a full-height
slab over the whole composer stack or the canvas dock — that cuts
"Generate Image" and covers the last message.

**Why:** Vincent asked for a Cursor-style footer under the input, then
the full-stack slab clipped the generation card.

**How to apply:** Keep the opaque block on the prompt bar only. Top cards
use their own `bg-background`. The canvas `workspace-composer-dock` stays
transparent (`overflow-visible`). Do not put `bg-background` on the
full-width dock.
