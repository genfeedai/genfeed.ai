-- Pre-flight duplicate guard for the hot-table UNIQUE indexes built CONCURRENTLY
-- in the next two migrations (post_analytics daily key; live Stripe
-- customer/subscription ids). #1185, epic #1176.
--
-- Why this is its own migration
-- -----------------------------
-- A `CREATE INDEX CONCURRENTLY` statement cannot share a migration file with a
-- `DO $$ … $$` block: Prisma wraps a mixed-statement migration in an implicit
-- transaction, and CONCURRENTLY cannot run inside one — the index build then
-- fails at deploy time with "CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block" (observed in release-gate E2E). A DO-block-only migration
-- is transaction-safe, so the dedup guard runs HERE and the following two
-- migrations contain ONLY bare CONCURRENTLY builds (matching the proven
-- precedent 20260618130000_add_app_shell_hot_path_indexes). See prisma/prisma#14456.
--
-- Each check only reads (SELECT COUNT). If a live duplicate exists it RAISEs and
-- aborts the deploy BEFORE any index is built, surfacing the pre-existing bug for
-- a reviewed manual dedupe/merge rather than leaving an INVALID index behind. On
-- databases where the unique index already exists there can be no duplicates, so
-- these are no-ops.

-- post_analytics: one snapshot per (postId, platform, date). No soft-delete column.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "post_analytics"
    GROUP BY "postId", "platform", "date"
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted (#1185): % duplicate (postId, platform, date) group(s) in post_analytics. Dedupe these before applying the unique constraint.', dup_count;
  END IF;
END$$;

-- customers: one live row per stripeCustomerId (isDeleted = false, non-null id).
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

-- subscriptions: one live row per stripeSubscriptionId (isDeleted = false, non-null id).
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
