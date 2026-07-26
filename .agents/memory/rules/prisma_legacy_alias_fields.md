# Prisma rows: never read Mongo-era alias fields

**last_verified: 2026-07-26** · Canonical doc: [docs/identity-resolution.md](../../../docs/identity-resolution.md)

`*Document` types layer optional legacy aliases (`_id`, `organization`, `user`, `role`) on top of
Prisma rows. They type-check and are **undefined at runtime** — the data is in the scalar FKs
(`organizationId`, `userId`, `roleId`).

- Read scalar FKs. Defensive fallback: `row.organizationId || row.organization`.
- Filters are fine (`processSearchParams` maps `user`→`userId`), but `normalizeWhere` drops
  `undefined` — a lookup built from an undefined alias silently widens the query. `BaseService.findOne`
  guards `_id`/`id` passed as `undefined`/`null`/`''` rather than returning an unscoped first row.
- Blast radius seen in 2026-07: the org switcher rendered a foreign org, duplicated.

**`bun run check:relation-alias-reads` reports a floor, not an inventory.** It knows two shapes:
coercing an alias to a string id, and using one as an id-shaped filter value. Since 2026-07-25 it
sees through `as`/`satisfies`/`!`/parens — that spelling had shipped two live bugs. Still invisible
to it:

- **Bare comparisons** — `if (post.organization !== orgId)`, which is exactly how a tenant gate is
  written. `undefined === undefined` passes, so the gate never runs.
- **Files with no row binding** — an alias reached through a helper's return value is never scanned.

A zero from the guard means "neither known shape," not "clean." When auditing a file, read it —
both defects in batch 3 of the #2033 backlog were found by reading, not by the ratchet.
