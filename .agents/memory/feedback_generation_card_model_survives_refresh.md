---
name: generation card model survives refresh
description: Generation-card model, Auto priority, and outputs persist in a Zustand store separate from chat
type: feedback
---

# Generation card prefs survive refresh

The chat store (`agent-chat.store`) is Zustand **in-memory** and dies on
refresh. Composer and the generation card share
`useAgentPreferredModelStore` (Zustand + localStorage), but **not** the
same keys.

- Chat: `genfeed:agent-preferred-chat-model:v1` / `-priority:v1`
- Generation card: `genfeed:agent-preferred-generation-by-scope:v1`, keyed
  by `threadId:image|video`. `/agent/new` uses `__new__` and copies onto
  the created thread once. Image and video conversations do not share a
  model.

**Why:** Writing an image model into the chat key made the composer
remount as "Select models…". A single global generation key made a video
card's model land on an image conversation.

**How to apply:** Generation card reads/writes `writePreferredGeneration*`
with `{ threadId, generationType }`. A stored generation model wins over
`action.generationParams.model`. Do not write image/video picks into the
chat helpers. Do not read another thread or type as a fallback.
