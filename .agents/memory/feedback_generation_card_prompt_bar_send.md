---
name: generation card prompt-bar send
description: Generation card uses the prompt-bar toolbar and square ArrowUp send
type: feedback
---

# Generation card submits like the prompt bar

The generation card toolbar is one unlabeled row: model, aspect ratio,
outputs (and duration when needed) on the left, the same square
`ButtonSize.ICON` ArrowUp send on the right. Stop is the same square
destructive control. Enter in the one-line prompt submits.

**Why:** Vincent asked to trigger generate the same way as the prompt
bar and to clean up the labeled grid plus the tall "Generate Image"
play button.

**How to apply:** Do not put MODEL / ASPECT RATIO / OUTPUTS captions
above the controls. Do not use a labeled Play submit. Keep
`aria-label` "Generate image" / "Generate video" so tests and
assistive tech still find the control.
