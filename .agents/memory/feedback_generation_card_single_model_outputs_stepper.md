---
name: generation card single model outputs stepper
description: Generation card picks one model; multiple images use the 1x outputs stepper
type: feedback
---

# One model, N outputs

The generation card model picker is **single-select**. Multiple images
come from the **Outputs** `1x` stepper (same control as studio), not
from checking several models.

**Why:** Vincent saw checkboxes and expected multi-model = multi-output.
The card had defaulted to multi-select UI while only keeping one model.

**How to apply:** Pass `selectionMode="single"` on the generation-card
picker. Put the outputs stepper on the card and forward `outputs` through
`confirm_generate_media` → `POST /v1/images`.
