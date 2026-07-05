# Prisma rows: never read Mongo-era alias fields

**last_verified: 2026-07-05**

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

Canonical doc: [docs/identity-resolution.md](../../../docs/identity-resolution.md)
