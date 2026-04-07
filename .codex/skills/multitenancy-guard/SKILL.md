---
name: multitenancy-guard
description: Enforces tenant and soft-delete query guards for backend changes.
---

# multitenancy-guard

Use when changing backend data access in `apps/server/*`.

## When to use

- Any MongoDB query changes
- Any list/read/update/delete service/controller change
- Any auth/tenant-scoped endpoint updates

## Hard rules

- Apply soft-delete guard consistently (`isDeleted: false`) where required by existing patterns.
- Never allow cross-tenant reads/writes in enterprise (`ee/`) code paths.
- Keep `users._id` as canonical DB user reference; do not use Clerk `user.id` as foreign key.
- Enterprise code (`ee/`): every tenant-scoped MongoDB query must include organization guard.
- Self-hosted (non-`ee/`): organization guard is optional for single-tenant deployments.

## Execution checklist

1. Inspect query filters in changed code paths.
2. Verify soft-delete guards are present where expected.
3. If editing `ee/` code, verify organization guards are present.
4. Confirm serializers are still used for outbound responses.
5. Run targeted tests for affected module/package.

## Quick verification

- Search for query changes in edited files:
  - `rg -n "find\(|findOne\(|aggregate\(|update|delete|organization|isDeleted" apps/server`
- Run scoped tests:
  - `bun run test --filter=@genfeedai/api`
