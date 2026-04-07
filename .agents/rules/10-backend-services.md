---
description: Backend service guardrails for NestJS apps.
globs:
  - "apps/server/**"
---

- Preserve soft-delete constraints in data access paths; organization scoping is required for `ee/` enterprise paths and recommended elsewhere.
- Keep service boundaries explicit; avoid cross-service coupling without clear interface changes.
- Add/maintain tests for controller/service behavior changes.
