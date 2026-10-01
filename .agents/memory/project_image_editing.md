---
name: Image editing contract
description: Dedicated image editing across Agent, Studio and Library, tracked by issue 5808.
type: project
last_verified: 2026-10-01
---

# Image editing

User authorized complete implementation on 2026-10-01. Canonical delivery tracking: https://github.com/genfeedai/genfeed.ai/issues/5808.

**Why:** references on generation, Remix, reframe and upscale do not provide a dedicated instruction-based editing contract.

**How to apply:** use `POST /images/:id/edit`, the `IMAGE_EDIT` model category and the supported editing contract registry. Seed `ideogram-ai/ideogram-4-5` as the editing default. Preserve ordinary IMAGE/VIDEO defaults. Persist outputs as IMAGE ingredients with parent/source lineage and a sanitized imageEdit recipe. Keep raw instructions unchanged and share normal asynchronous generation, funding, completion, cancellation and retry paths.

Provider contract verified from https://replicate.com/ideogram-ai/ideogram-4-5 on 2026-10-01: ordered 1–5 sources, optional black-edit/white-preserve mask matching primary dimensions, seven explicit sizes or source, integer seed 0–2147483647, native 1–8 outputs. Pin medium quality ($0.06 per output); generic generation inference cannot safely bind `images`/`mask`, so use a dedicated builder.

Strict admission resolves every source and mask within organization, brand, IMAGE category, nondeleted and ready state before funding or placeholder creation. Explicit unavailable/unsupported models fail; editing never inherits an ordinary generation model. Resolve omitted model from the editing category registry and validate again before dispatch.

Agent and MCP expose edit_image and the existing mutation approval matrix, with shared credit settlement. Studio owns a distinct image-edit settings/draft/history type and editSource/editMask attachment roles. Library Edit opens a source-only draft with an empty instruction. Re-edit starts with the result only and clears old mask/seed/references; Reuse restores the original editing inputs and instruction. Missing restored inputs block submission.

Acceptance evidence must cover scoped source admission, masks, exact provider payload, output bounds/batch billing, default resolution, Agent policy/gateway, Studio edit payload/persistence/recipes and Library entry. Required independent review and current-head CI remain delivery gates.
