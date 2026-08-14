---
name: generation card single model outputs dropdown
description: Generation card picks one model; multiple images use the Outputs dropdown
type: feedback
---

# One model, N outputs

The generation card model picker is **single-select**. Multiple images
come from the **Outputs** `ButtonDropdown` (`1x`…`maxOutputs`), the same
control family as Aspect Ratio — not a second Radix `Select` skin, not
multi-model checkboxes, and not a cycle button.

**Why:** Vincent saw checkboxes and expected multi-model = multi-output,
then asked for a real dropdown instead of the `1x` stepper that did not
remember the pick on refresh. A later pass put Outputs on `Select`, which
looked like a different control than Model / Aspect Ratio.

**How to apply:** Pass `selectionMode="single"` on the generation-card
picker. Use `ButtonDropdown` for Outputs with the same
`border border-border bg-background hover:bg-accent/50` trigger and
`DropdownDirection.UP` as Aspect Ratio. Persist the count with
`writePreferredGenerationOutputs` and forward `outputs` through
`confirm_generate_media` → `POST /v1/images`.
