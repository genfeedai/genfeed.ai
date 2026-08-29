---
name: system_workflows_admin_only
description: Hidden system workflow graphs stay out of customer surfaces; official templates remain separately installable
type: project
status: active
last_verified: 2026-08-24
topics: [workflows, automation, admin]
---

**Rule:** Customer Automate → Workflows lists tenant-authored workflows only. Hidden Genfeed system workflows execute from the code-owned catalog through the normal workflow engine and are not persisted as customer-visible clones. Customers discover separately designated official templates via Templates and install tenant-owned copies.

**Why:** The former model conflated internal system execution graphs with user-installable templates and then created workflow-shaped rows around direct callbacks. Internal product behavior and customer automation use the same engine, but they are different visibility products.

**How to apply:**
- Default `GET /workflows` exposes tenant-authored workflows only.
- Do not create persisted per-organization clones for hidden system workflows.
- Keep official installable templates explicitly designated and separate from hidden system graphs. Catalog install is opt-in.
- Default daily post/newsletter/image bundles are not auto-provisioned.
