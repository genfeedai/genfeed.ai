---
name: system_workflows_admin_only
description: Persisted system workflow clones belong on Admin, not the customer Automate library
type: project
status: active
last_verified: 2026-08-24
topics: [workflows, automation, admin]
---

**Rule:** Customer Automate → Workflows lists tenant-authored workflows only. Rows with `metadata.systemWorkflow` stay off that page. Operators inspect them at Admin → Automation → Workflows (`GET /workflows?includeSystem=true`). Customers discover installable graphs via Templates (`GET /workflows?source=system-catalog`) and install a tenant-owned copy.

**Why:** Seeded system clones (Content Loop Autopilot, Brand Remix handoff, analytics sync, …) leaked into the customer library as a System badge with no pause control. They are platform internals, not customer automations.

**How to apply:**
- Default `GET /workflows` excludes `metadata.systemWorkflow.kind = system-workflow`.
- Admin list passes `includeSystem=true`.
- Do not clone the full system catalog onto an organization at signup. Catalog install is opt-in.
- Default daily post/newsletter/image bundles are not auto-provisioned.
