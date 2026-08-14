---
name: legacy hard cut
description: Inventory and target state for removing leftover Clerk/Mongo/cron compatibility
type: project
last_verified: 2026-08-14
---

# Legacy hard cut — target state

**Why:** The app is green. Remaining "legacy" is leftover compatibility, not a second product. No aliases, wrappers, or dual-read paths.

**How to apply:** Branch `cursor/legacy-hard-cut-6f8c`. Do not re-audit from comments; this file is the inventory.

## Already gone (do not restore)

- Prisma `mongoId` / `users.authProviderId`
- Protected-shell compatibility (#1836)
- Permanent 301s in `apps/app/next.config.ts` (those ARE the hard cut of old URLs)
- Nest `legacyDecorator: true`
- Model catalog `isLegacy`
- MCP `classify() === 'legacy'` live REST tools (rename later; do not delete)
- Marketplace `._id`
- Voice catalog wire names

## Cut in this sweep

1. Dead shims: `send_card`, relocation ack fields, HTTP `pagination=false`, Document string-ID overlays, unused `authProviderOrganizationId`, `@ui/inputs`, deprecated metric/button aliases
2. Rename files queue `authProviderUserId` → `userId`; drop `local.genfeed.ai`
3. Delete cron-jobs collection, worker dispatcher, Prisma tables, `legacyCronJob` node
4. Replace Clerk `publicMetadata` with canonical `userId` / `organizationId` / `brandId` on `request.user`
5. Drop `Post.status` dual API; clients send `targetExecutionState` / `visibility` only. Prisma `Post.status` remains a response projection via `projectLegacyPostStatus`.
