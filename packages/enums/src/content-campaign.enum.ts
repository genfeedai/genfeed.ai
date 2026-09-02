/**
 * Publish content-campaign lifecycle.
 *
 * A content campaign is a Publish program: one brief that many releases and
 * channel targets are produced against. It is distinct from the outreach
 * `CampaignStatus` in `campaign.enum.ts`, which belongs to Messages.
 *
 * These are product-language String-column vocabularies, not Prisma enums.
 *
 * Epic #4120, child #4138.
 */

export enum ContentCampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}
