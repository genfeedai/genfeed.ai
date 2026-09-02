ALTER TABLE "subscription_attributions"
  ADD COLUMN "stripeSubscriptionId" TEXT;

-- Preserve every historical row while selecting one canonical row for each
-- existing Stripe subscription. Older duplicate snapshots retain their JSON
-- metadata but stay outside the new normalized uniqueness key.
WITH ranked_attributions AS (
  SELECT
    "id",
    NULLIF("metadata"->>'stripeSubscriptionId', '') AS "stripeSubscriptionId",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "metadata"->>'stripeSubscriptionId'
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "rank"
  FROM "subscription_attributions"
  WHERE JSONB_TYPEOF("metadata") = 'object'
    AND NULLIF("metadata"->>'stripeSubscriptionId', '') IS NOT NULL
)
UPDATE "subscription_attributions" AS attribution
SET "stripeSubscriptionId" = ranked."stripeSubscriptionId"
FROM ranked_attributions AS ranked
WHERE attribution."id" = ranked."id"
  AND ranked."rank" = 1;

-- Online indexes are created outside this transactional migration by the
-- follow-up migration 20260830210100_fix_review_data_integrity_online_indexes.

-- Workflow artifacts use the repository-wide isDeleted soft-delete contract.
UPDATE "workflow_artifacts"
SET "isDeleted" = true
WHERE "deletedAt" IS NOT NULL OR "state" = 'DELETED';

ALTER TABLE "workflow_artifacts"
  DROP COLUMN "deletedAt";
