---
name: agent-layout-split-and-full
description: Agent layouts are two arrangements, split (conversation left, output right, resizable) and full (thread list left, conversation larger)
type: feedback
last_verified: 2026-11-24
---

# Agent layouts: split and full

Vincent 2026-11-24, with screenshots of the reference app, named the two arrangements to use:

- **Split:** conversation on the left, the app's output (or the open thread) on the right. The divider is draggable on every app and the width is remembered under one shared key (`AGENT_OUTPUT_SPLIT_STORAGE_KEY`, `packages/ui/.../agent-output-layout/agent-pane.constant.ts`). No app passes its own key.
- **Full size:** the thread list moves to the left (`AgentThreadListLayout`) and the conversation takes the larger share. `/agent/[id]?view=full` and `/agent/new`.

**Why:** the Turbo screenshot showed a fixed 50/50 split with no divider, and full size was a bare conversation with no thread list.

**How to apply:** a new app with native output wraps its page in `AgentOutputShell` (the divider comes with it). Do not add a per-app storage key or a fixed-width agent pane.
