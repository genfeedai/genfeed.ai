# Postgres RDS instances (us-west-1)

last_verified: 2026-07-08

| Instance | Role | Endpoint | Notes |
|---|---|---|---|
| `genfeed-data` | **PRODUCTION** | `genfeed-data.cjo0gec08b5r.us-west-1.rds.amazonaws.com:5432` | **db.t4g.micro**, PG 18.3, `default.postgres18` (`max_connections` ≈ 80–110). Renamed from `genfeed-local` 2026-06-08. Master creds reset same day. Never point local env here. |

## Connection gotchas

- **RDS PG 18 forces SSL** (`rds.force_ssl=1` system default). `PrismaService` resolves TLS explicitly for `@prisma/adapter-pg`: production server images bundle the AWS RDS CA at `/certs/rds-ca.pem`, and the service also honors `PRISMA_POSTGRES_CA_FILE` / `PGSSLROOTCERT`. `?sslmode=no-verify` remains a local escape hatch when no CA file is available.
- **`PrismaService` reads `DATABASE_URL` through `ConfigService.get()`** (`apps/server/api/src/shared/modules/prisma/prisma.service.ts`) and passes an explicit `PrismaPg` adapter config. Prisma CLI and package scripts still read `process.env.DATABASE_URL` through `packages/prisma/prisma.config.mjs`.
- **Pool config is explicit in `createPrismaPgConfig`** (2026-07-03): `max 10` / `min 2` warm floor / idle 5 min / acquire timeout 10s / `maxLifetimeSeconds 1800` / keepAlive. Tune via Prisma-style URL params `connection_limit` (→ max) and `pool_timeout` (s → acquire timeout); both are stripped before pg sees the URL. Rationale: pg defaults (idle 10s) churned TLS connects to RDS (Sentry `pg.connect` avg ~234ms). All backend services share this module — keep services × max × 2 (deploy overlap) under the t4g.micro `max_connections` ceiling.
- The previous local-dev RDS instance `local-genfeedai` has been deleted. Local development now uses the local Postgres database at `localhost:5432/genfeed`.
- `DATABASE_URL` lives in per-service `.env.local` files (api, files, mcp, notifications, workers) + `packages/prisma/prisma/.env`. Check for stale references before running Prisma commands.
- Db/user/database all named `genfeed`. Prisma tables snake_case (`organizations`, `users`).

## History

- 2026-06-08: `genfeed-local` renamed → `genfeed-data` (promoted to prod); old empty `genfeed-data` deleted (final snapshot `genfeed-data-empty-final-20260608`).
- Pre-rename snapshot: `rds:genfeed-local-2026-06-08-13-00`; pre-reconcile manual snapshot: `genfeed-data-pre-reconcile-20260609-1818`.
- Local homebrew Postgres `genfeed` db (localhost:5432) is the current local development DB. As of 2026-07-08, the API points there and the observed local rows are the seed skeleton: one `vincent@genfeed.ai` user, one `default` organization, one `default` brand, zero ingredients, and zero posts.
