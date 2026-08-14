---
name: composer opaque dock
description: Composer dock paints bg-background so transcript text cannot pass under the bar
type: feedback
---

# Composer dock is an opaque background block

The floating prompt bar sits on a solid `bg-background` dock (Cursor/Codex
footer), not over a transparent gap. Transcript lines must not show through
the glass bar or the padding under it.

**Why:** Vincent asked for a block with the page background so conversation
text does not pass under the composer.

**How to apply:** `PromptBarContainer` keeps `[data-composer-bg-block]` as
`absolute inset-0 bg-background` behind the stack. The canvas composer dock
(`workspace-composer-dock`) is also `bg-background` (transparent only while
the slot is empty). Do not rely on glass/`backdrop-blur` alone to hide
scrolled text.
