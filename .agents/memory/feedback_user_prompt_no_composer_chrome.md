---
name: user prompt no composer chrome
description: Agent user prompts are card-plane fill with no hairline — history must not clone the docked prompt bar
type: feedback
last_verified: 2026-09-04
---

# User prompts are not extra prompt bars

Sticky user turns use `bg-card` with **no** `border` / `border-border-strong`.
The docked composer is the only rounded hairline input in the thread.

**Why:** Matching radius + `--border-strong` made previous prompts look like
copies of the prompt bar.

**How to apply:** Change `AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS`. Assistant
prose stays borderless document flow. Timeline product cards may still use
`AGENT_CONVERSATION_SURFACE_CLASS` (card + hairline).
