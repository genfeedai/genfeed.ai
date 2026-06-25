---
name: gpu_instances_off_by_default
description: Keep Genfeed GPU/Fleet inference instances off unless Vincent explicitly needs them
type: feedback
status: active
last_verified: 2026-05-31
topics: [cost, infrastructure, managed-inference, fleet, gpu]
---

**Rule:** Genfeed GPU-backed inference instances must stay OFF by default. Only turn them back ON when Vincent explicitly says he needs them for active work.

**Why:** These instances are cost-sensitive and should not run idly.

**How to apply:**
- Do not start Fleet/GPU-backed image, video, voice, ComfyUI, LoRA, or similar inference instances as a background/default step.
- Before any work that would require those instances, first check whether the task can use mocks, tests, local code inspection, BYOK, or the managed inference bridge without starting infrastructure.
- If live GPU inference is required, make the need explicit and start only the minimum needed instance(s).
- After the active need is done, stop the instance(s) again unless Vincent says to keep them running.
