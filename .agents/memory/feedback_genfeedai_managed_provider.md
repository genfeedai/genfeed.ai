---
name: genfeedai_managed_provider
description: Model Genfeed-managed inference as provider=genfeedai, enabled per customer from console
type: feedback
status: active
last_verified: 2026-05-31
topics: [managed-inference, providers, console, billing, gpu]
---

**Rule:** Genfeed-managed inference must be represented as a first-class provider named `genfeedai`, like `fal` and `replicate`.

**Why:** Genfeed's own GPU/Fleet/LoRA/ComfyUI infrastructure is a managed provider product, not just an internal fallback. It should be assignable to specific customer accounts and managed from `console.genfeed.ai`.

**How to apply:**
- Add/use `genfeedai` as the public provider abstraction for Genfeed-managed image/video/voice models.
- Do not enable the `genfeedai` provider by default for every customer.
- Provider availability, account assignment, limits, model access, and operational controls should be managed by the private console/admin system.
- Public/self-hosted code should only know the provider contract and managed inference bridge; private console/inference infrastructure owns the backend mapping to Fleet, ComfyUI, LoRA models, or third-party fallbacks.
