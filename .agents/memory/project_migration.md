---
name: Migration Status
description: cloud + core → genfeed.ai migration is complete — all pages, tests, packages migrated
type: project
---

**Why:** Two repos (cloud SaaS + core open-source) were merged into genfeed.ai monorepo.

**How to apply:** genfeed.ai is the canonical repo. cloud/ and core/ may exist on disk as historical references but are no longer source of truth. Check current package metadata before publishing changes to `@genfeedai/create`.

Migration stats: 114 web pages (105 cloud + 9 core), 3871 test files, all 12 NestJS services compile.
Historical UI duplication should be re-verified from the current tree before acting on #83-era fallow notes; there is no standalone `apps/admin` workspace.
