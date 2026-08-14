---
name: social-warmup-enrollments
description: Persist guided social warm-up enrollments, checklist audit, and readiness signals
type: project
---

# Social warm-up enrollments (#2214)

**Why:** Guided warm-up needs durable enrollment/progress that survives reload, reconnect, and blueprint updates. Credential `createdAt` is connection time, not native social-account age.

**How to apply:**
- Persist `SocialWarmupEnrollment` per `(organizationId, credentialId)` where `isDeleted = false`. Pin `blueprintId` + `blueprintVersion`.
- Append `SocialWarmupEvent` rows for complete/reopen (item id, provenance, actor, timestamp).
- Store `SocialWarmupSignal` rows separately from user confirmations; include observed-at, stale-at, status, source, and secret-free evidence.
- On disconnect, keep events, mark PLATFORM signals STALE, expose reconnect.
- Account health and the scheduled-publishing gate consume enrollment signals for age. Never use credential `createdAt` as native account age.
- Serializers in `packages/serializers/` own public shaping. Tenant queries always use `organizationId` + `isDeleted: false`.
- Do not reuse admin `WarmupAccount` (customer lead warmup).
