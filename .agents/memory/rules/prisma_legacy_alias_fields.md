# Prisma rows: never read Mongo-era alias fields

**last_verified: 2026-08-13** · Canonical doc: [docs/identity-resolution.md](../../../docs/identity-resolution.md)

`*Document` types layer optional legacy aliases (`_id`, `organization`, `user`, `role`) on top of
Prisma rows. They type-check and are **undefined at runtime** — the data is in the scalar FKs
(`organizationId`, `userId`, `roleId`).

- Read scalar FKs. Defensive fallback: `row.organizationId || row.organization`.
- Filters are fine (`processSearchParams` maps `user`→`userId`), but `normalizeWhere` drops
  `undefined` — a lookup built from an undefined alias silently widens the query. `BaseService.findOne`
  guards `_id`/`id` passed as `undefined`/`null`/`''` rather than returning an unscoped first row.
- Blast radius seen in 2026-07: the org switcher rendered a foreign org, duplicated.

**`bun run check:relation-alias-reads` is a CI inventory ratchet.** It flags
coercing an alias to a string id, using one as an id-shaped filter value,
comparing one to an id (`post.organization !== orgId`), and using `_id` /
`organization` / `user` as an object key for a scalar id in `packages/`.
Counts may only go down. Guard tests run in the CI guards job.

Still read the file when auditing: an alias reached through a helper return
value, or a comparison that does not look like an id operand, can stay
invisible. A zero means none of the inventoried shapes, not that every
identity read is gone.
