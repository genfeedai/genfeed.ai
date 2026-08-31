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

CREATE UNIQUE INDEX "subscription_attributions_org_stripe_subscription_key"
  ON "subscription_attributions"("organizationId", "stripeSubscriptionId");

-- Workflow artifacts use the repository-wide isDeleted soft-delete contract.
UPDATE "workflow_artifacts"
SET "isDeleted" = true
WHERE "deletedAt" IS NOT NULL OR "state" = 'DELETED';

ALTER TABLE "workflow_artifacts"
  DROP COLUMN "deletedAt";

CREATE INDEX "posts_org_credential_status_scheduled_idx"
  ON "posts"("organizationId", "credentialId", "isDeleted", "status", "scheduledDate");

CREATE INDEX "posts_org_credential_status_published_idx"
  ON "posts"("organizationId", "credentialId", "isDeleted", "status", "publishedAt");
