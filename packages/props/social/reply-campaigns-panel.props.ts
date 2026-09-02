import type {
  SocialPlatform,
  SocialReplyCampaignInput,
} from '@genfeedai/contracts/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type { SocialReplyCampaignTransition } from '@genfeedai/services/social/reply-campaigns.service';

/**
 * A conversation available for enrollment. The platform travels with it
 * because a campaign runs on exactly one platform — the API rejects mixed
 * enrollments.
 */
export interface ReplyCampaignEnrollableConversation {
  id: string;
  platform: SocialPlatform;
}

/** Draft state of the inline campaign form, before it becomes an API payload. */
export interface ReplyCampaignDraft {
  bodyTemplate: string;
  maxPerDay: string;
  maxPerHour: string;
  messageType: 'dm' | 'reply';
  minDelaySeconds: string;
  name: string;
  platform: SocialPlatform | '';
}

export interface ReplyCampaignsPageProps {
  busyCampaignId: string | null;
  campaigns: SocialReplyCampaignModel[];
  /**
   * Conversations available for enrollment on the selected platform.
   */
  enrollableConversations: ReplyCampaignEnrollableConversation[];
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  onCreate: (input: SocialReplyCampaignInput) => Promise<void> | void;
  onRefresh: () => void;
  onTransition: (
    campaignId: string,
    transition: SocialReplyCampaignTransition,
  ) => Promise<void> | void;
}
