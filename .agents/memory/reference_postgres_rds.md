# Postgres RDS instances (us-west-1)

last_verified: 2026-06-10

| Instance | Role | Endpoint | Notes |
|---|---|---|---|
| `genfeed-data` | **PRODUCTION** | `genfeed-data.cjo0gec08b5r.us-west-1.rds.amazonaws.com:5432` | Renamed from `genfeed-local` 2026-06-08. Master creds reset same day. Never point local env here. |
| `local-genfeedai` | local dev | `local-genfeedai.cjo0gec08b5r.us-west-1.rds.amazonaws.com:5432` | db.t4g.micro, PG 18.3, 20 GB gp3, backups off, created 2026-06-10. Shares prod SG `sg-024507391851666e8` + subnet group `genfeed-rds`. |

## Connection gotchas

- **RDS PG 18 forces SSL** (`rds.force_ssl=1` system default). `@prisma/adapter-pg` sends no TLS by default → `P1010 "User was denied access on the database"` (looks like permissions, is actually missing TLS). Prisma CLI works regardless (auto-negotiates). Fix: `?sslmode=no-verify` in `DATABASE_URL` (TLS on, skip CA verify — RDS CA absent from node trust store).
- **`PrismaService` reads raw `process.env.DATABASE_URL`** (`apps/server/api/src/shared/modules/prisma/prisma.service.ts`) — bypasses `BaseConfigService` file layering. Actual injection: bun auto-loads `apps/server/<service>/.env{,.local}` when turbo spawns package dev scripts.
- `DATABASE_URL` lives in per-service `.env.local` files (api, files, mcp, notifications, workers) + `packages/prisma/prisma/.env`. Root `.env.local` has none.
- Db/user/database all named `genfeed`. Prisma tables snake_case (`organizations`, `users`).

## History

- 2026-06-08: `genfeed-local` renamed → `genfeed-data` (promoted to prod); old empty `genfeed-data` deleted (final snapshot `genfeed-data-empty-final-20260608`).
- Pre-rename snapshot: `rds:genfeed-local-2026-06-08-13-00`; pre-reconcile manual snapshot: `genfeed-data-pre-reconcile-20260609-1818`.
- Local homebrew Postgres `genfeed` db (localhost:5432) is a disposable seed skeleton.
