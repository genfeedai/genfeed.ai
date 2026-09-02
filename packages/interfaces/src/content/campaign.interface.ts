import type { ContentCampaignStatus } from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';

/**
 * Publish content campaign: one brief that many releases and channel targets
 * are produced against, so a program of 70 posts or 1,000 ads is one object an
 * operator can plan, filter, and measure.
 *
 * Distinct from the outreach campaign in Messages and from an Automate program.
 */
export interface ICampaign extends IBaseEntity {
  brandId: string;
  /** Shared creative brief every release in the campaign is produced from. */
  brief?: string | null;
  endDate?: string | null;
  name: string;
  /** What the campaign is trying to achieve, in the operator's own words. */
  objective?: string | null;
  organizationId: string;
  startDate?: string | null;
  status: ContentCampaignStatus;
  /** Canonical `users.id` of the operator who created the campaign. */
  userId: string;
}
