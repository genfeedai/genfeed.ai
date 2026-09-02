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

/**
 * Coordinating mutations on a publish content campaign. Distinct from
 * Messages outreach start/pause/complete.
 */
export enum ContentCampaignLifecycleAction {
  ASSIGN = 'assign',
  COMPLETE = 'complete',
  GENERATE = 'generate',
  PAUSE = 'pause',
  START = 'start',
  UNASSIGN = 'unassign',
}

export enum ContentCampaignItemKind {
  POST = 'post',
  RELEASE = 'release',
}

export enum ContentCampaignItemOutcomeStatus {
  FAILED = 'failed',
  INELIGIBLE = 'ineligible',
  SKIPPED = 'skipped',
  SUCCEEDED = 'succeeded',
}

/** Campaign statuses that must not start new Campaign-directed dispatch. */
export const CONTENT_CAMPAIGN_DISPATCH_BLOCKED_STATUSES: readonly ContentCampaignStatus[] =
  [
    ContentCampaignStatus.ARCHIVED,
    ContentCampaignStatus.COMPLETED,
    ContentCampaignStatus.PAUSED,
  ];

export function isContentCampaignDispatchBlocked(
  status: string | null | undefined,
): boolean {
  return CONTENT_CAMPAIGN_DISPATCH_BLOCKED_STATUSES.includes(
    status as ContentCampaignStatus,
  );
}
