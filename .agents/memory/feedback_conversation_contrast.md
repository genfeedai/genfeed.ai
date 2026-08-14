---
name: conversation contrast
description: Studio chrome stays dead-neutral; conversation type is AA; color comes from media
type: feedback
---

**Rule:** Keep the void canvas and overlay menus dark. Lift conversation type, not chrome chroma. Color comes from gallery, video, and image artefacts.

**Why:** Near-black panels plus `#6b6b78` muted text made the agent thread unreadable. A neon product accent would compete with the media the studio is for.

**How to apply:**

1. Dark studio tokens: `text-primary` `#ffffff`, `text-secondary` `#c8c8d0`, `text-muted` `#8a8a8a` (AA on `#050607`).
2. Assistant prose is solid `text-foreground`, not `/90`–`/92`.
3. Conversation cards use `bg-tertiary` + `border-border-strong`. Overlay menus stay `bg-secondary`.
4. Do not introduce a brand violet/cyan accent for buttons or tabs.
