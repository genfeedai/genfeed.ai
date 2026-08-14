---
name: generation card one-line prompt
description: Generation-card prompt is one line; Read & edit sits on that same row
type: feedback
---

# One-line generation prompt

The generation-card prompt field is **one line**. Long or multiline
prompts still open through **Read & edit**, which sits on the same row
as the compact field (not on the PROMPT label row).

**Why:** Vincent asked to collapse the tall textarea and align Read &
edit with the field. Two compact rows plus a header-row action made the
docked card feel oversized.

**How to apply:** Keep `GENERATION_PROMPT_COMPACT_ROWS = 1` and
`GENERATION_PROMPT_COMPACT_MAX_HEIGHT = 32`. Override `min-h-textarea`
(`60px`) with `min-h-8 h-8 max-h-8`. Offer the preview when the prompt
has more than one line or exceeds the char budget. Do not grow the
compact field back to two rows.
