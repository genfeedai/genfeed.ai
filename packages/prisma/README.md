# Prisma

The PostgreSQL schema, generated client and migrations for Genfeed (`@genfeedai/prisma`). The API, workers and scripts all read and write the database through this package.

For the desktop app's local database see [`../desktop-prisma`](../desktop-prisma/README.md); this package is the server schema.

## Layout

- `prisma/schema.prisma`: the schema (PostgreSQL with the `vector` extension). The client is generated into `generated/prisma/` (git-ignored, rebuilt on `postinstall`).
- `prisma/migrations/`: the migration history, one folder per migration. Many migrations have a `*.test.ts` beside them under `prisma/`.
- `src/`: the package entry (`index.ts`, `client.ts`, `testing.ts`), the enum and model metadata map (`enum-field-map.ts`, generated) and the `toPrismaJson` helper.
- `scripts/`: the model metadata generator and release and index verification scripts.
- `__tests__/`: unit tests for `src/`.

## Commands

```bash
bun run db:generate   # regenerate the client and src/enum-field-map.ts
bun run db:validate   # validate the schema
bun run db:migrate    # apply migrations (prisma migrate deploy)
```

Run `db:generate` after any schema change and commit the resulting `src/enum-field-map.ts`.

## Tests

```bash
cd packages/prisma && bunx vitest run
```

Some migration and integration tests need a local PostgreSQL.

## Changing data

Which channel a data change belongs in (data migration, reference-data sync or fixture seed) is decided in [`.agents/memory/context/data-change-protocol.md`](../../.agents/memory/context/data-change-protocol.md). Read it before adding a migration.
