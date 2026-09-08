---
name: multitenancy-guard
description: Enforces tenant and soft-delete query guards for backend changes.
---

# multitenancy-guard

Use when changing backend data access in `apps/server/*`.

## When to use

- Any Prisma query changes
- Any list/read/update/delete service/controller change
- Any auth/tenant-scoped endpoint updates

## Hard rules

- Apply soft-delete guard consistently (`isDeleted: false`) where required by existing patterns.
- Never allow cross-tenant reads/writes on SaaS multi-tenant code paths.
- Keep `users.id` as the canonical user reference. It is an **opaque string** — production holds
  both legacy Better Auth base62 ids and UUIDs. Never validate it as a Genfeed entity id.
- Every tenant-scoped Prisma query (SaaS multi-tenant) must include `{ organizationId, isDeleted: false }`.
- Filter on scalar foreign keys, never relation-name aliases — `bun run check:relation-alias-reads` is a hard ban.
- Self-hosted single-tenant deployments: organization guard is optional.

## Execution checklist

1. Inspect query filters in changed code paths.
2. Verify soft-delete guards are present where expected.
3. If editing a tenant-scoped query, verify organization guards are present.
4. Confirm serializers are still used for outbound responses.
5. Run targeted tests for affected module/package.

## Quick verification

- Search for query changes in edited files:
  - `rg -n "find\(|findOne\(|aggregate\(|update|delete|organization|isDeleted" apps/server`
- Run scoped tests:
  - `bun run test --filter=@genfeedai/api`
