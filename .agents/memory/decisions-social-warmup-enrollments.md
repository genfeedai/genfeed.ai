---
name: social-warmup-enrollments-decisions
description: Modeling and account-age decisions for guided social warm-up enrollments
type: project
---

# Decisions — social warm-up enrollments (#2214)

**Why:** Keep enrollments independent of blueprint catalog updates and of admin lead-warmup.

**How to apply:**
- Three Prisma models: enrollment, append-only event, signal. No `mongoId`. Soft delete is `isDeleted` only.
- Unique active enrollment is a **partial** SQL index, not `@@unique` in schema.prisma.
- Provenance stays the blueprint lowercase string (`user_confirmed` / `platform_verified` / `genfeed_observed`).
- Account age prefers `native-account-age`, then `first-upload-platform-signal` `createTime`. STALE / FAILED / MISSING stay distinct.
- Credentials-core stays a leaf: `AccountHealthService` queries Prisma and imports pure helpers, not the enrollments Nest module.
- TikTok authorized snapshots still merge into `credential.warmupSignals`; they also upsert enrollment signal rows when an enrollment exists.
