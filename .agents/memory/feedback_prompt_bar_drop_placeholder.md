---
name: prompt bar drop placeholder
description: File drag over the agent prompt bar swaps the empty placeholder to "drop it here?"
type: feedback
status: active
last_verified: 2026-08-14
topics: [agent, composer, prompt-bar]
---

# Prompt bar drop placeholder

While a file is dragged over the agent prompt bar, the empty composer
placeholder is **drop it here?** — not a separate overlay that says
"Drop files here".

**Why:** The overlay hid the field copy. The drop cue belongs in the same
placeholder the user already reads.

**How to apply:**

- Drive the string from `common.agent.composer.dropPlaceholder`.
- Keep the ring highlight; do not cover the editor with drop-label chrome.
- Restore the idle placeholder when the drag leaves or the drop completes.
