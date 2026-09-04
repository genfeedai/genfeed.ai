ALTER TABLE "posts"
VALIDATE CONSTRAINT "posts_campaign_membership_brand_required_check";

ALTER TABLE "post_groups"
VALIDATE CONSTRAINT "post_groups_campaign_membership_brand_required_check";

ALTER TABLE "posts"
VALIDATE CONSTRAINT "posts_campaignId_organizationId_brandId_fkey";

ALTER TABLE "post_groups"
VALIDATE CONSTRAINT "post_groups_campaignId_organizationId_brandId_fkey";

ALTER TABLE "campaign_paid_activations"
VALIDATE CONSTRAINT "campaign_paid_activations_campaignId_organizationId_brandId_fkey";
