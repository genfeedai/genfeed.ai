---
name: generation card manual collapse on error
description: Failed generation cards stay expandable; the operator can collapse them by hand
type: feedback
---

# Failed generation cards can collapse

A new failure expands the generation card once so the error is visible.
After that, the header chevron collapses the card even while status is
`error`. Do not lock the card open for the whole Failed state.

**Why:** Vincent could not collapse the docked card after a failed
generate. The error panel covered the prompt bar.

**How to apply:** Honor `isCollapsed` for every status. Expand on a
status change to `error` or `idle`, then leave later toggles alone.
