# Desktop Prisma

The schema, client and migrations for the Genfeed desktop app's local database (`@genfeedai/desktop-prisma`). It is separate from [`../prisma`](../prisma/README.md): that package is the hosted PostgreSQL schema, this one runs the desktop app's embedded PostgreSQL (PGlite) and is used by the desktop app only.

## Layout

- `prisma/schema.prisma`: the desktop schema. The client is generated into `generated/desktop-prisma/` (git-ignored, rebuilt on `postinstall`).
- `prisma/migrations/`: SQL migrations. They are applied by `runDesktopPrismaMigrations` in `src/migrations.ts`, which keeps its own `_prisma_migrations` ledger, instead of `prisma migrate`.
- `src/`: `createDesktopPrismaClient` (`client.ts`), `runDesktopPrismaMigrations` (`migrations.ts`) and the package entry (`index.ts`).
- `__tests__/`: tests for the client and the migration runner.

## Commands

```bash
bun run db:generate   # regenerate the client
bun run db:validate   # validate the schema
```

## Tests

```bash
cd packages/desktop-prisma && bunx vitest run
```

## Changing data

See [`.agents/memory/context/data-change-protocol.md`](../../.agents/memory/context/data-change-protocol.md) before adding a migration that touches existing data.
