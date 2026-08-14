---
name: generation card model survives refresh
description: Generation-card Auto priority and model pick persist via the preferred-model store
type: feedback
---

# Generation card model pick survives refresh

Auto / Lowest Cost (and a concrete model) on the generation card is a
user preference. It is written to the same `genfeed:agent-preferred-chat-*`
store the composer uses, then read back on remount.

**Why:** Vincent picked Auto · Lowest Cost on the card, refreshed, and
got Best Quality again. The card kept the pick in React state only.

**How to apply:** On model or priority change, write
`writePreferredAgentChatModel` / `writePreferredAgentChatPriority`. On
mount, hydrate from that store (Auto in the store wins over a model the
agent pinned on the action).
