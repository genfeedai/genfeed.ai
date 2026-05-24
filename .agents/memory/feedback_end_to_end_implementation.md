---
name: feedback_end_to_end_implementation
description: Do not ship half-architecture; implement features end to end
type: feedback
status: active
last_verified: 2026-04-29
topics: [workflow, implementation-quality, architecture]
---

**Rule:** When implementing a feature or architecture change, carry it end to end. Do not ship a halfway implementation that proves one slice while leaving the intended user flow, frontend integration, backend boundary, docs, or runtime wiring unfinished.

**Why:** Vincent explicitly corrected this after the desktop offline-generation work partially implemented local generation in the desktop prototype renderer instead of completing the intended architecture: one `apps/app` frontend inside Electron, shared backend action code, and Electron IPC/local services without duplicating the frontend or NestJS backend.

**How to apply:**
- Before committing, verify the implementation matches the actual architecture requested, not just a convenient subset.
- If a feature crosses packages, wire the full path: shared logic, adapters, IPC/API surface, real frontend, docs, and smoke path.
- Do not describe partial work as shipped. If a sub-slice is unavoidable, keep it unmerged or explicitly blocked with the remaining end-to-end path tracked.
- Prefer one coherent vertical slice that users can run over multiple disconnected foundations.
