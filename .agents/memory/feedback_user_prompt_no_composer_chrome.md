---
name: user prompt no composer chrome
description: Agent user prompts render through @ui/card/Card — square shadow-border, not PromptBarComposer chrome
type: feedback
last_verified: 2026-09-04
---

# User prompts use Card, not composer chrome

Sticky user turns render `<Card>` from `@ui/card/Card` (`rounded-card` +
`shadow-border` + `bg-card`). They do **not** use `PromptBarComposer` or a
hand-rolled `rounded-xl` class bag.

**Why:** A class-string “mini composer” either vanished (`bg-card` on the
canvas with no edge) or looked like a second prompt bar (matching radius +
hairline). Card is the shared content surface; the docked input stays
`PromptBarComposer`.

**How to apply:** Keep `AGENT_CONVERSATION_USER_PROMPT_LAYOUT_CLASS` for track
width only. Chrome comes from Card. Assistant prose stays borderless document
flow. Do not put history inside `PROMPT_BAR_SURFACE_CLASS`.
