---
name: console_managed_inference_control_plane
description: Private console owns Genfeed-managed Fleet/model/customer assignment
type: feedback
status: active
last_verified: 2026-06-18
topics: [console, managed-inference, fleet, models, customers, repository-boundary]
---

**Rule:** The private `genfeedai/console` repository is the internal control plane for Genfeed-managed inference. It is the place that should have access to all Fleet infrastructure and all models that can be connected to the public `genfeedai` managed provider for done-for-you Genfeed.ai customers.

**Why:** The public `genfeed.ai` monorepo should expose provider contracts, DTOs, client bridges, and customer-facing UI, but not private Fleet/ComfyUI/LoRA lifecycle controls or direct model infrastructure access. The private console is where Genfeed staff manage provider availability, model access, customer assignments, operational controls, and private runtime integrations.

**How to apply:**
- Treat `genfeedai/console` as the source of truth for assigning Genfeed-managed provider access to customer accounts.
- Keep Fleet, ComfyUI, LoRA, GPU lifecycle controls, and private model inventory/availability inside console or private infrastructure repos.
- In public `genfeed.ai`, model this as provider `genfeedai` plus managed inference contracts and bridge calls.
- Do not add public-route bootstrap, settings, or page-load checks that directly probe Fleet, ComfyUI, LoRA, or GPU health.
