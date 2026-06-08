---
name: inference_servers_private_boundary
description: Keep Genfeed inference server implementations out of the public monorepo
type: feedback
status: active
last_verified: 2026-05-31
topics: [architecture, open-source, inference, gpu, repository-boundary]
---

**Rule:** Genfeed inference server implementations must be separated from the public `genfeed.ai` monorepo. The public repo should keep only public client contracts, bridge DTOs, provider routing abstractions, and self-hosted integration points.

**Why:** GPU/Fleet/LoRA/ComfyUI server code is private operational infrastructure and should not live in the open-source monorepo.

**How to apply:**
- Do not add new inference server implementation code under public `apps/server/images`, `apps/server/videos`, `apps/server/voices`, or similar public app folders.
- For managed inference work, keep public code limited to the managed inference bridge/client, DTOs, validation, and fallback routing.
- Put private GPU/Fleet/LoRA/ComfyUI server implementations and lifecycle controls in the private console/admin repo or another private infrastructure repo.
- When touching existing public inference server code, prefer extracting or isolating it behind public contracts rather than expanding it.
