---
name: no composer context meter
description: Do not show a context-window usage meter on the agent composer
type: feedback
---

# No composer context-window meter

The agent composer does not show token / context-window usage
(`105 / 128k` or a fill bar). That chrome is not useful on this surface.

**Why:** Vincent asked to drop it during local QA — the meter took space
and nobody was using the number.

**How to apply:** Do not add a context-usage indicator to the prompt bar,
toolbar, or generation card. Keep the bar for prompt, voice, generate, and
advanced-mode model controls only.
