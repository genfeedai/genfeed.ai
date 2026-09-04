-- Campaign membership is scoped by both tenant and brand. PostgreSQL enforces
-- the NOT VALID constraints for new writes immediately; the follow-up
-- migration validates existing rows without blocking normal reads or writes.

ALTER TABLE "posts"
DROP CONSTRAINT "posts_campaignId_fkey";

ALTER TABLE "post_groups"
DROP CONSTRAINT "post_groups_campaignId_fkey";

ALTER TABLE "campaign_paid_activations"
DROP CONSTRAINT "campaign_paid_activations_campaignId_fkey";

ALTER TABLE "posts"
ADD CONSTRAINT "posts_campaign_membership_brand_required_check"
CHECK ("campaignId" IS NULL OR "brandId" IS NOT NULL)
NOT VALID;

ALTER TABLE "post_groups"
ADD CONSTRAINT "post_groups_campaign_membership_brand_required_check"
CHECK ("campaignId" IS NULL OR "brandId" IS NOT NULL)
NOT VALID;

ALTER TABLE "posts"
ADD CONSTRAINT "posts_campaignId_organizationId_brandId_fkey"
FOREIGN KEY ("campaignId", "organizationId", "brandId")
REFERENCES "campaigns"("id", "organizationId", "brandId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "post_groups"
ADD CONSTRAINT "post_groups_campaignId_organizationId_brandId_fkey"
FOREIGN KEY ("campaignId", "organizationId", "brandId")
REFERENCES "campaigns"("id", "organizationId", "brandId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "campaign_paid_activations"
ADD CONSTRAINT "campaign_paid_activations_campaignId_organizationId_brandId_fkey"
FOREIGN KEY ("campaignId", "organizationId", "brandId")
REFERENCES "campaigns"("id", "organizationId", "brandId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;
