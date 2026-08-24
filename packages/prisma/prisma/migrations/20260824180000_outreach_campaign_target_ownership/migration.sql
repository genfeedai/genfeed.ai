-- Fail closed if any target/campaign organization pair disagrees. Do not
-- rewrite tenant ownership; operators must repair drift before this lands.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campaign_targets" AS target
    JOIN "outreach_campaigns" AS campaign
      ON campaign."id" = target."campaignId"
    WHERE target."organizationId" IS DISTINCT FROM campaign."organizationId"
  ) THEN
    RAISE EXCEPTION
      'campaign_targets contains organization ids that do not match their parent outreach_campaigns';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "campaign_targets" AS target
    WHERE NOT EXISTS (
      SELECT 1
      FROM "outreach_campaigns" AS campaign
      WHERE campaign."id" = target."campaignId"
        AND campaign."organizationId" = target."organizationId"
    )
  ) THEN
    RAISE EXCEPTION
      'campaign_targets contains campaign references that cannot be bound to a matching organization';
  END IF;
END $$;

CREATE UNIQUE INDEX "outreach_campaigns_id_organizationId_key"
ON "outreach_campaigns"("id", "organizationId");

CREATE INDEX "outreach_campaigns_organizationId_status_isDeleted_idx"
ON "outreach_campaigns"("organizationId", "status", "isDeleted");

ALTER TABLE "campaign_targets"
DROP CONSTRAINT "campaign_targets_campaignId_fkey";

ALTER TABLE "campaign_targets"
ADD CONSTRAINT "campaign_targets_campaignId_organizationId_fkey"
FOREIGN KEY ("campaignId", "organizationId")
REFERENCES "outreach_campaigns"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "campaign_targets_org_campaign_status_deleted_idx"
ON "campaign_targets"("organizationId", "campaignId", "status", "isDeleted");

CREATE INDEX "campaign_targets_org_status_deleted_scheduled_idx"
ON "campaign_targets"("organizationId", "status", "isDeleted", "scheduledAt");
