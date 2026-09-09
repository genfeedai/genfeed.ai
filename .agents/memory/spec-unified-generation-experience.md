---
name: Unified generation experience
description: Shared waiting UI, platform previews with account identity, and live actionable activity
type: project
last_verified: 2026-09-09
---

# Unified generation experience

Issue: #4601.

**Why:** Generation status and results must feel consistent across Agent, Studio, and asset types. A completed social post must show how it appears on its destination platform with the selected account identity.

**How to apply:** Use the shared GenerationStatus component for generation waiting. Preserve media-specific result controls. Use one platform renderer with adapters for agent artifacts and publishing targets. Resolve an explicit connected account, or an unambiguous connected account in the current brand; otherwise use brand name/logo. Never select the first of multiple accounts. Do not fabricate engagement, progress, ETA, cancellation success, or backend stages.

## Acceptance

- Studio image, video, music, avatar and voice requests create immediate placeholders, retain terminal outcomes, and reconcile pending persisted IDs after refresh/reconnect.
- Agent media and batch waiting use the same motion and status language as Studio/library.
- Measurable progress uses accessible numeric progress; opaque jobs show a status and elapsed time. Reduced motion disables the shimmer. Timer ticks do not trigger live announcements.
- Cancellation uses the server endpoint and respects its returned state; failed jobs are not relabeled cancelled without the persisted cancellation reason.
- Social post previews share account name/handle/avatar and platform rendering across producers, preserving threads, attachments and first comments.
- The bell displays scoped live activities with links; missed events reconcile from durable records. Raw unscoped socket data is never displayed as an organization job.

## Verification

Focused UI, Studio hook/session, preview identity, and activity listener tests; scoped typechecks; changed-file lint; required PR CI. Verification results belong in the PR.
