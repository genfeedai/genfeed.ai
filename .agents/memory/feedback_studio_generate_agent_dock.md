---
name: studio generate agent dock
description: Studio generate floats PromptBarContainer over the masonry like Agent — no inflow bg-background slab
type: feedback
last_verified: 2026-09-04
---

# Studio generate composer matches the Agent dock

`/studio/generate` hosts `PromptBarContainer` as `layoutMode="surface-fixed"`
over the gallery column. No `bg-background` on the dock. Masonry scrolls under
a short top fade; `pb-40` on the scroller keeps the last row reachable.

**Why:** `layoutMode="inflow"` plus `bg-background` reserved a black footer that
clipped the masonry. Agent already floats the composer; Studio did not.

**How to apply:** Keep the bar inside the results column (not over the
inspector). Do not put `bg-background` on the workspace composer dock. Gallery
cards open the inspector on card click — no extra "View Prompt" button.
