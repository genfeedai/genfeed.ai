---
name: soft-delete isDeleted contract
description: Soft-delete is isDeleted boolean only; tombstone instant is updatedAt
type: project
---

# Soft-delete contract: `isDeleted` + `updatedAt`

**Why:** There is no separate `deletedAt` column on cloud models. Soft-delete is a boolean (`isDeleted`). When a row is soft-deleted, `updatedAt` is updated on the same write and is the tombstone instant.

**How to apply:**

- Filters: always include `isDeleted: false` (or explicit `true` when listing tombstones).
- Never introduce `deletedAt` on Prisma/cloud models or desktop local schema.
- Wire APIs that need a deletion instant surface **`updatedAt`** (with `isDeleted: true`), not a parallel timestamp field.
- Desktop local DB (`@genfeedai/desktop-prisma` `DesktopAsset`) uses `isDeleted` (migration `0004_desktop_asset_is_deleted`); contracts mirror that.

**Related:** `.agents/memory/system/CRITICAL-NEVER-DO.md` (never use `deletedAt`), desktop sync push rejection path in `desktop-sync.service.ts`.
