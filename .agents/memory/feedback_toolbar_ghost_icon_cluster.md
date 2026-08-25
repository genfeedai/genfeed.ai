---
name: toolbar ghost icon cluster
description: Toolbar icon actions are ghost, 14px, and grouped at the far right
type: feedback
---

# Ghost icon actions sit together at the far right

Labeled and bordered toolbar controls (filters, search, sort, segmented
view toggle, primary Generate) come first. Icon-only actions (refresh,
upload) are **ghost**, **32×32**, **14px** Lucide (`SHELL_ICON_*`), and
grouped in one cluster after those controls. Do not mix `secondary`
bordered icon buttons next to `ghost` refresh.

**Why:** Library had a 24px Upload on `secondary` beside a 14px ghost
Refresh, so some squares had borders and the glyphs did not match.

Table pills take their hairline from `badgeVariants` (`border` on the
base). Do not pass `className="border"` on some badges and omit it on
others.
