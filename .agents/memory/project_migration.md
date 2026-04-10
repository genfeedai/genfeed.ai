---
name: Migration Status
description: cloud + core → genfeed.ai migration is complete — all pages, tests, packages migrated
type: project
---

**Why:** Two repos (cloud SaaS + core open-source) were merged into genfeed.ai monorepo.

**How to apply:** genfeed.ai is the canonical repo. cloud/ and core/ still exist on disk as reference but are no longer source of truth. The @genfeedai/create package still points to genfeedai/core — needs updating as part of epic #95.

Migration stats: 114 web pages (105 cloud + 9 core), 3871 test files, all 12 NestJS services compile.
Known issue: UI packages triplicated across apps/app, apps/admin, apps/website (same files, same hash). Tracked in #83 fallow report.
