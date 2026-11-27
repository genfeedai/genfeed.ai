---
name: soft-delete isDeleted contract
description: Soft-delete is isDeleted boolean only; tombstone instant is updatedAt
type: project
---

# Soft-delete contract: `isDeleted` + `updatedAt`

**Why:** There is no separate `deletedAt` column on cloud models. Soft-delete is a boolean (`isDeleted`). When a row is soft-deleted, `updatedAt` is updated on the same write and is the tombstone instant.

**How to apply:**

- Filters: always include `isDeleted: false` (or explicit `true` when listing tombstones).
- Never introduce `deletedAt` on Prisma/cloud models.
- Wire APIs that need a deletion instant surface **`updatedAt`** (with `isDeleted: true`), not a parallel timestamp field.

**Related:** `AGENTS.md` Data rules (never use `deletedAt`).
