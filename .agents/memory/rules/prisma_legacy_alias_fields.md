# Prisma rows: never read Mongo-era alias fields

**last_verified: 2026-08-14** · Canonical doc: [docs/identity-resolution.md](../../../docs/identity-resolution.md)

Scalar foreign keys (`organizationId`, `userId`, `brandId`, `roleId`) are the only
persistence identity on Prisma rows. Relation names are reserved for actual
Prisma relation objects. Soft delete is `isDeleted`.

- Read scalar FKs. Do not dual-read `row.organizationId || row.organization`.
- Filters are fine (`processSearchParams` maps `user`→`userId`), but `normalizeWhere` drops
  `undefined` — a lookup built from an undefined alias silently widens the query. `BaseService.findOne`
  guards `_id`/`id` passed as `undefined`/`null`/`''` rather than returning an unscoped first row.

**`bun run check:relation-alias-reads` is a hard ban.** It flags coercing an
alias to a string id, using one as an id-shaped filter value, comparing one to
an id (`post.organization !== orgId`), and using `_id` / `organization` /
`user` as an object key for a scalar id. Zero violations is the required state.

API request identity is `AuthenticatedUser` on `request.user`
(`userId`, `organizationId`, `brandId`, `isSuperAdmin`). Do not nest those
fields under Clerk-shaped `publicMetadata`. Controllers use
`extractRequestContext` / `getIsSuperAdmin` — there is no `getPublicMetadata`.
