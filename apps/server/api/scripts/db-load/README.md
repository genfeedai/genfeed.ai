# Database load suite

Finds the queries that stop working as the schema grows, using the queries the
API and workers actually run. It scales every relationship to 10x, 100x and
1000x, profiles each query with enough samples to be statistically meaningful,
and renders a before/after report.

Nothing here touches a shared or production database. `seed.ts` and the runner
both go through `assertIsolatedDatabaseUrl`: the host must be local and the
database name must contain `test`.

## What it measures

- **Scale model** (`scale.ts`). 1x is 10 organisations plus one "whale"; each
  organisation has the same per-parent fan-out (brands, credentials, posts and
  their ingredient links, analytics snapshots, activities, credit ledger, agent
  threads and messages, workflow runs, notifications). At scale N the tenant
  count grows N times (breadth: table sizes, cross-tenant scans) and the whale's
  fan-out grows N times (depth: deep pages, big counts and sorts).
- **Queries** (`catalog.ts`). Each entry calls production code (services,
  controller query builders, worker sweeps) through the production Prisma stack
  with the CLOUD tenant guard enabled. Add an entry by pointing at the real
  function; do not retype SQL.
- **Method** (`run.loadtest.ts`). Rounds in shuffled order, a warm-up per round,
  random typical tenants per call, one call at a time, a per-statement timeout
  that counts as a failure, then `EXPLAIN (ANALYZE, BUFFERS)` on every statement
  the call issued.
- **Statistics** (`stats.ts`, `report.ts`). Medians and percentiles with
  bootstrap CIs; before vs after with Mann-Whitney U, Holm-adjusted across all
  comparisons; "significant" means adjusted p < 0.01 and a speed-up CI that
  excludes 1.

## Run it

You need a disposable PostgreSQL 16 with `pgvector` (not the dev database):

```bash
initdb -D /tmp/pgload/data -A trust && pg_ctl -D /tmp/pgload/data -o "-p 55432" start
createdb -h 127.0.0.1 -p 55432 -U postgres genfeed_load
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/genfeed_load \
  bunx prisma migrate deploy --schema packages/prisma/prisma/schema.prisma   # once, from packages/prisma
# one database per scale, cloned from the migrated template
for s in 1 10 100 1000; do createdb -h 127.0.0.1 -p 55432 -U postgres -T genfeed_load genfeed_loadtest_${s}x; done

cd apps/server/api
bun run db-load:seed                       # 1000x is ~11 GB and takes ~15 min
bun run db-load:profile -- --label before  # writes db-load-results/before-<scale>x.json
# ...change code or add a migration (migrate deploy on each scale database)...
bun run db-load:profile -- --label after
bun run db-load:report                     # db-load-results/report.html + report.json
```

Environment: `LOADTEST_PG_BASE` (default `postgresql://postgres@127.0.0.1:55432`),
`LOADTEST_SAMPLES` (45), `LOADTEST_ROUNDS` (3), `LOADTEST_FILTER` (regex on query
id), `LOADTEST_STATEMENT_TIMEOUT_MS` (30000), `LOADTEST_BUDGET_MS` (20000).

The suite needs the compiled `@genfeedai/contracts` package once:
`bunx turbo run build --filter=@genfeedai/contracts`.

## Limits

One machine with warm caches and no concurrent load. Absolute latencies are
lower than production; growth curves and before/after ratios are what carry
over. The thresholds in the report (slow 100 ms / fail 500 ms interactive,
250 ms / 2 s sweeps) are the report's own.

## First results (1000x, local PostgreSQL 16, 45 samples x 3 rounds)

| Query | Before | After |
|---|---|---|
| posts.list.page1, typical tenant | 157 ms | 3.9 ms |
| posts.list.page1, whale | 219 ms | 57 ms |
| posts.list.deep, whale | 220 ms | 80 ms |
| posts.list.scheduled, typical tenant | 29 ms | 3.6 ms |

The fix is `posts_user_deleted_created_at_idx`: the posts list filters on
`userId = $1 OR organizationId = $2`, and no index led with `userId`, so the
planner seq-scanned `posts` for both the page and the count.

The inbox and overview-metrics changes only run independent reads in parallel.
On a local database the round trips cost nothing, so the suite shows no
difference for them; the win appears where the database is a network hop away.

Still over budget at 1000x, deliberately left for follow-up:

- `analytics.overview` and `analytics.top-content` (whale): the history CTE
  with a LATERAL baseline scales with the whale's `post_analytics` rows. Needs
  a rollup table.
- `library.list.search` (whale): ILIKE over joined metadata and prompts. A
  `pg_trgm` index would help but adds an extension, so it needs a decision.
- `library.list.*` (whale): offset pagination plus `count(*)` over 67k to 135k
  rows. Keyset pagination is already available on `BaseService`.
