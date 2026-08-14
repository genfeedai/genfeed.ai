---
name: generation card single model outputs dropdown
description: Generation card picks one model; multiple images use the Outputs dropdown
type: feedback
---

# One model, N outputs

The generation card model picker is **single-select**. Multiple images
come from the **Outputs** dropdown (`1x`…`maxOutputs`, same pattern as
Duration), not from checking several models and not from a cycle button.

**Why:** Vincent saw checkboxes and expected multi-model = multi-output,
then asked for a real dropdown instead of the `1x` stepper that did not
remember the pick on refresh.

**How to apply:** Pass `selectionMode="single"` on the generation-card
picker. Use `Select` for Outputs. Persist the count with
`writePreferredGenerationOutputs` and forward `outputs` through
`confirm_generate_media` → `POST /v1/images`.
