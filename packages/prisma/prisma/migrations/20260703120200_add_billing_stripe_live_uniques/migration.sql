-- Enforce one LIVE local record per Stripe identity (#1185, epic #1176).
--
-- Why these are natural keys
-- --------------------------
-- Stripe customer ids (`cus_…`) and subscription ids (`sub_…`) are globally
-- unique and never reused by Stripe. The billing webhook resolves a SINGLE local
-- row by them — `CustomersService.findByStripeCustomerId` (findFirst) and
-- `subscriptionsService.findOne({ stripeSubscriptionId })` — so two live rows
-- sharing one Stripe id is a latent data-integrity bug (double-processed
-- webhook, re-link race). The app already assumes at-most-one; this makes the
-- database guarantee it.
--
-- Scope: live rows only
-- ---------------------
-- Uniqueness is scoped to `isDeleted = false` and non-null ids. Soft-deleted
-- history and not-yet-provisioned rows (null id) are intentionally excluded so a
-- legitimate resubscribe/relink after a soft delete cannot be blocked. Because
-- the predicate carries a WHERE clause, these are PARTIAL unique indexes, which
-- Prisma cannot represent as `@@unique` and ignores during introspection — so
-- they live in raw SQL only, exactly like the #892 default-recurring-workflow
-- partial unique index. There is deliberately no schema.prisma counterpart.
--
-- Safety against existing duplicates
-- ----------------------------------
-- Each index is preceded by a preflight that aborts the (transactional)
-- migration if a live duplicate already exists, surfacing the pre-existing bug
-- for a reviewed manual merge rather than failing mid-build or corrupting data.

-- ── customers.stripeCustomerId ──────────────────────────────────────────────
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "customers"
    WHERE "stripeCustomerId" IS NOT NULL
      AND "isDeleted" = false
    GROUP BY "stripeCustomerId"
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted (#1185): % live duplicate stripeCustomerId group(s) in customers. Merge them before applying the unique index.', dup_count;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_stripeCustomerId_live_key"
  ON "customers" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL AND "isDeleted" = false;

-- ── subscriptions.stripeSubscriptionId ──────────────────────────────────────
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "subscriptions"
    WHERE "stripeSubscriptionId" IS NOT NULL
      AND "isDeleted" = false
    GROUP BY "stripeSubscriptionId"
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted (#1185): % live duplicate stripeSubscriptionId group(s) in subscriptions. Merge them before applying the unique index.', dup_count;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_live_key"
  ON "subscriptions" ("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL AND "isDeleted" = false;
