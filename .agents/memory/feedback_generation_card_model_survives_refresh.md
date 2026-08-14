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
- Generation card: `genfeed:agent-preferred-generation-model:v1` /
  `-priority:v1` / `-outputs:v1`

**Why:** Writing an image model into the chat key made the composer
remount as "Select models…". The card also ignored a stored concrete
model whenever the action still pinned one.

**How to apply:** Generation card reads/writes `writePreferredGeneration*`
only. A stored generation model wins over `action.generationParams.model`.
Do not write image/video picks into the chat helpers.
