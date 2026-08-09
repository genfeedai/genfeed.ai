---
name: decisions retire orphaned content drafts
description: Approach comparison and decisions for issue #2643
type: project
---

# Decisions: retire orphaned content drafts (#2643)

## Optimization target

Remove the duplicate runtime lifecycle while maximizing recoverability and minimizing tenant-crossing or deploy-time data risk.

## Approaches considered

1. Drop the orphaned table and API immediately. This is the smallest diff, but silently loses reviewable content and lineage.
2. Keep ContentDraft and add a frontend. This preserves data but entrenches two lifecycles and increases every future review/publish change.
3. Cut all producers over to canonical Posts, link review batches to those Posts, and retain the old table behind a dry-run-first migration. This removes the runtime duplication while preserving ambiguous history for operator resolution.

Decision: use approach 3.

## Specific decisions

- Generated Posts may be untargeted until review or scheduling assigns a credential/platform.
- Producer idempotency lives on the Post target idempotency key, scoped by organization.
- The first autopublish target reuses the reviewable Post; additional targets create sibling Posts.
- Existing review batches validate linked Post organization and brand and never compensate by deleting a reused Post.
- A brand owner or active organization member must resolve to canonical `users.id`; organization IDs are never substituted as user foreign keys.
- The deployment migration marks the existing physical table as retired without renaming it, avoiding a rolling-deploy break for older instances. Runtime Prisma no longer maps it.
- The operator migration fails live convergence when any row remains deleted, ambiguous, concurrently changed, or otherwise blocked. No historical row is deleted in #2643.
