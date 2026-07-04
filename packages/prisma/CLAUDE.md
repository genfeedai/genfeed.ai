# @genfeedai/prisma

PostgreSQL schema, migrations, and generated client for all `apps/server/*` services. (Desktop has its own separate `packages/desktop-prisma/`.)

## Schema rules

- Soft deletes: `isDeleted Boolean` — never `deletedAt`.
- Compound indexes: `@@index` directives in `prisma/schema.prisma`, or explicit migration SQL for anything `@@index` can't express.
- Tenant-scoped models carry `organizationId`; API queries filter `{ organizationId, isDeleted: false }`.

## Migrations

- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction: keep CONCURRENTLY statements in their own migration file, separate from any preflight/dedup DML. Mixing them blocked a production deploy (#1212).
- Hot-path index expectations are asserted in `prisma/hot-path-indexes.test.ts` — update it when adding or removing indexes.
- Never edit an already-applied migration; add a new one.
- Verify: `bun run test --filter=@genfeedai/prisma`.
