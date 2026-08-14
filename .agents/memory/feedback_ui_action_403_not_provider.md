---
name: ui action 403 not provider
description: Confirm-generate 403s are our API (allowlist/brand/org), not a model-provider block
type: feedback
---

# UI-action 403 is our hop, not Replicate

`POST /v1/agent/threads/:id/ui-actions` maps a failed `confirm_generate_media`
to JSON:API 403. That hop is our `/v1/images` guards (model allowlist, brand
access, org context) — not the model provider rejecting the account.

**Why:** Vincent hit "Provider access denied" on generate. The body was
`Insufficient permissions` because we wiped the real detail, then the
composer formatter treated any 403 as Replicate.

**How to apply:** Keep `Failed to respond to UI action: 403` on
"Action not allowed" and pass through the JSON:API detail (e.g. "Model not
enabled for this organization"). `ModelsGuard` accepts cuid org ids via
`isEntityId`, not 24-char hex only. Do not tell the operator the provider
blocked them when our API did.
