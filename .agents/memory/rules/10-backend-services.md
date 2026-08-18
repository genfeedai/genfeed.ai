---
description: Backend service guardrails for NestJS apps.
paths:
  - "apps/server/**"
---

- Preserve soft-delete constraints in data access paths; organization scoping is required on every tenant-scoped query (single-tenant self-host may omit the org filter).
- Keep service boundaries explicit; avoid cross-service coupling without clear interface changes.
- Add/maintain tests for controller/service behavior changes.
