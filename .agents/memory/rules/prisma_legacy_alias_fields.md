# Prisma rows: never read Mongo-era alias fields

**last_verified: 2026-07-25**

`*Document` types (`MemberDocument`, etc.) add optional legacy aliases
(`_id`, `organization`, `user`, `role`) on top of Prisma rows. They
type-check but are **undefined at runtime** — live data is in the scalar FKs
(`organizationId`, `userId`, `roleId`).

- Read scalar FKs; defensive fallback pattern: `row.organizationId || row.organization`.
- Filters are fine (`processSearchParams` maps `user`→`userId` etc.), but
  `normalizeWhere` drops `undefined` values — a lookup built from an undefined
  alias silently widens the query. `BaseService.findOne` guards `_id`/`id`
  explicitly passed as `undefined`/`null`/`''` (returns `null`, never an
  unscoped first-row read).
- Observed blast radius (2026-07): org switcher rendered a foreign org,
  duplicated, from `findMine` mapping `member.organization`.

## The guard's count is a floor, not an inventory

`bun run check:relation-alias-reads` only knows two shapes: coercing an alias
to a string id, and using one as the value of an id-shaped filter key. Since
2026-07-25 it sees through `as`/`satisfies`/`!`/parentheses, so a cast no
longer hides a read — that spelling had shipped two live bugs
(`originalPost.credential as string` unlinked every remixed post's credential;
`(task.brand as string | undefined)?.toString()` enqueued every follow-up task
brandless). Still invisible:

- **Bare comparisons** — `if (post.organization !== orgId)` matches neither
  rule, and that is exactly how a tenant gate is written. `undefined ===
  undefined` passes, so the gate never runs.
- **Files with no row binding** — an alias reached through a helper's return
  value is never even scanned.

So a zero from the guard means "none of the two known shapes", not "clean".
When auditing a file, read it. Both defects found in batch 3 of the #2033
backlog were found by reading, not by the ratchet.

Canonical doc: [docs/identity-resolution.md](../../../docs/identity-resolution.md)
