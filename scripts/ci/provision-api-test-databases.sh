#!/usr/bin/env bash
# Provisions the fully-migrated Postgres databases that the API's
# *.postgres.spec.ts suites need (billing-account-scope and credit-balance).
# Mirrors the "Provision billing-account-scope and credit-balance test
# databases" step of the `Test API` job in ci.yml: migrate once, then copy the
# second database with CREATE DATABASE ... TEMPLATE (a file-level copy).
#
# Requires a reachable Postgres at localhost:5432 (genfeed/genfeed_local, db
# `test`) and BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL in the environment.
set -euo pipefail

: "${BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL:?BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL required}"

export PGPASSWORD="${PGPASSWORD:-genfeed_local}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql -h localhost -U genfeed -d test -c "CREATE DATABASE billing_scope_test;"

# `bun x` inside packages/prisma (not root `bunx`): the pinned `prisma` is
# workspace-local and Prisma 7 reads the datasource URL only from
# packages/prisma/prisma.config.mjs.
(
  cd "${repo_root}/packages/prisma"
  DATABASE_URL="${BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL}" bun x prisma migrate deploy
)

psql -h localhost -U genfeed -d test -c "CREATE DATABASE credit_balance_test TEMPLATE billing_scope_test;"
