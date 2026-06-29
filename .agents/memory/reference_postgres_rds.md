# Postgres RDS instances (us-west-1)

last_verified: 2026-06-29

| Instance | Role | Endpoint | Notes |
|---|---|---|---|
| `genfeed-data` | **PRODUCTION** | `genfeed-data.cjo0gec08b5r.us-west-1.rds.amazonaws.com:5432` | Renamed from `genfeed-local` 2026-06-08. Master creds reset same day. Never point local env here. |
| `local-genfeedai` | local dev | `local-genfeedai.cjo0gec08b5r.us-west-1.rds.amazonaws.com:5432` | db.t4g.micro, PG 18.3, 20 GB gp3, backups off, created 2026-06-10. Shares prod SG `sg-024507391851666e8` + subnet group `genfeed-rds`. |

## Connection gotchas

- **RDS PG 18 forces SSL** (`rds.force_ssl=1` system default). `PrismaService` resolves TLS explicitly for `@prisma/adapter-pg`: production server images bundle the AWS RDS CA at `/certs/rds-ca.pem`, and the service also honors `PRISMA_POSTGRES_CA_FILE` / `PGSSLROOTCERT`. `?sslmode=no-verify` remains a local escape hatch when no CA file is available.
- **`PrismaService` reads `DATABASE_URL` through `ConfigService.get()`** (`apps/server/api/src/shared/modules/prisma/prisma.service.ts`) and passes an explicit `PrismaPg` adapter config. Prisma CLI and package scripts still read `process.env.DATABASE_URL` through `packages/prisma/prisma.config.mjs`.
- `DATABASE_URL` lives in per-service `.env.local` files (api, files, mcp, notifications, workers) + `packages/prisma/prisma/.env`. Root `.env.local` has none.
- Db/user/database all named `genfeed`. Prisma tables snake_case (`organizations`, `users`).

## History

- 2026-06-08: `genfeed-local` renamed → `genfeed-data` (promoted to prod); old empty `genfeed-data` deleted (final snapshot `genfeed-data-empty-final-20260608`).
- Pre-rename snapshot: `rds:genfeed-local-2026-06-08-13-00`; pre-reconcile manual snapshot: `genfeed-data-pre-reconcile-20260609-1818`.
- Local homebrew Postgres `genfeed` db (localhost:5432) is a disposable seed skeleton.
