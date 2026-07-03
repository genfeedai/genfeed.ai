-- Enforce one LIVE local record per Stripe identity (#1185, epic #1176).
-- Partial unique indexes on `customers.stripeCustomerId` and
-- `subscriptions.stripeSubscriptionId`, scoped to `isDeleted = false` and non-null
-- ids so soft-deleted history / not-yet-provisioned rows never block a legitimate
-- resubscribe/relink. Partial predicates can't be expressed as `@@unique`, so
-- these live in raw SQL only (like the #892 default-recurring-workflow index) —
-- there is deliberately no schema.prisma counterpart.
--
-- Built CONCURRENTLY: `customers` and `subscriptions` are hot billing tables
-- written by every Stripe webhook, so a plain `CREATE UNIQUE INDEX` would take an
-- ACCESS EXCLUSIVE lock for the whole build and stall webhook processing.
-- CONCURRENTLY keeps reads/writes running.
--
-- CONCURRENTLY must run OUTSIDE a transaction block. Prisma runs a migration's
-- statements without a wrapping transaction ONLY when the file contains just
-- CONCURRENTLY index builds — the earlier `DO $$ … $$` dedup preflights in this
-- file made Prisma wrap the whole migration in an implicit transaction, so the
-- builds failed with "CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block". This file therefore contains ONLY the bare CONCURRENTLY indexes,
-- matching the proven precedent 20260618130000_add_app_shell_hot_path_indexes.
-- See prisma/prisma#14456.
--
-- `IF NOT EXISTS` makes these no-ops where the index already exists (prod). If
-- live duplicates exist on a populated DB the CONCURRENTLY build fails and leaves
-- an INVALID index of the same name — DROP it, merge the duplicates, then
-- `prisma migrate resolve` + re-deploy. Do not blindly re-run.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "customers_stripeCustomerId_live_key"
  ON "customers" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL AND "isDeleted" = false;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "subscriptions_stripeSubscriptionId_live_key"
  ON "subscriptions" ("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL AND "isDeleted" = false;
