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

Agent and MCP expose `transform_media` (operation `edit`) and the existing mutation approval matrix, with shared credit settlement. Studio owns a distinct image-edit settings/draft/history type and editSource/editMask attachment roles. Library Edit opens a source-only draft with an empty instruction. Re-edit starts with the result only and clears old mask/seed/references; Reuse restores the original editing inputs and instruction. Missing restored inputs block submission.

Acceptance evidence must cover scoped source admission, masks, exact provider payload, output bounds/batch billing, default resolution, Agent policy/gateway, Studio edit payload/persistence/recipes and Library entry. Required independent review and current-head CI remain delivery gates.

## FLUX.3 Image

FLUX.3 Image is also available through the curated catalog, with separate IMAGE (`black-forest-labs/flux-3-image`) and IMAGE_EDIT (`black-forest-labs/flux-3-image-edit`) keys. The editing key is an internal alias: both dispatch to Replicate's `black-forest-labs/flux-3-image` endpoint. Keep both FLUX rows nondefault; Ideogram remains the editing default, and ordinary image/video defaults are preserved.

Public provider schema and prices verified on 2026-10-01: https://replicate.com/black-forest-labs/flux-3-image. FLUX accepts up to ten ordered references, requires at least one for editing, and returns one URI per request. References must be owned ready Library images in the request's organization/brand, JPEG/PNG/GIF/WebP, at least 256 pixels per side and at most 16 megapixels. Native resolutions are `768sq`, `1k`, `1.5k`, `2k`, `4k`; provider costs are respectively $0.0205, $0.024, $0.035, $0.05, $0.3035 per output. Quote and charge by the native resolution selector, defaulting to `1k`.

FLUX supports native `auto` and explicit aspect ratios; it has no mask, seed, Ideogram output-size control, quality tier or native batch. Fix grounding to false and output format/quality to JPG/80. Reject incompatible controls at admission and clear them with a visible notice when Studio switches models. Preserve excess sources visibly and block submission when switching back to a model with a lower source limit. Persist and restore FLUX editing recipes using its own contract version, resolution and aspect ratio. Agent cards must preserve native settings while the model catalog loads.

Release reconciliation seeds both dated FLUX contracts without replacing operator-reviewed or pending contracts. Existing explicit organization allowlists must include the desired FLUX keys. No database migration or paid provider smoke call is required by this integration.
