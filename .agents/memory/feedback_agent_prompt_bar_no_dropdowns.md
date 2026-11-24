---
name: agent-prompt-bar-no-dropdowns
description: The Agent prompt bar has no mode picker and no setting dropdowns; approvals follow the saved settings
type: feedback
---

The Agent prompt bar holds no Auto / Manual / Plan picker and no prompt-enhancement popover. The left group is the `+` that adds context, the right group is Send, mic and Stop.

**Why:** Vincent (2026-11-24): "no more promptbar dropdown for shit". A control that duplicates a setting does not belong in the bar.

**How to apply:**
- A thread takes its mode from the saved Personal setting (Settings > Personal > Agent mode) when the server creates it. No client changes it afterwards: `PATCH /agent/threads/mode` and the `mode` field on the thread metadata PATCH are removed.
- Callers that need a safe mode for one turn (the Library review prompt, the desktop loop URL) still pass `agentMode` on that turn's send options.
- The publish and send confirmation gate is unchanged. Do not weaken it when you touch mode code.
- Prompt-enhancement settings live in Studio (`GenerationHarnessSettingsSection`). Do not add them back to the bar.
