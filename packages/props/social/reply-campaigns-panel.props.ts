import type {
  SocialPlatform,
  SocialReplyCampaignInput,
} from '@genfeedai/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type { SocialReplyCampaignTransition } from '@genfeedai/services/social/reply-campaigns.service';

/**
 * A conversation the open inbox filters currently match. The platform travels
 * with it because a campaign runs on exactly one platform — the API rejects an
 * enrollment that mixes them.
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

export interface ReplyCampaignsPanelProps {
  busyCampaignId: string | null;
  campaigns: SocialReplyCampaignModel[];
  /**
   * Conversations currently matching the inbox filters. Creating a campaign
   * enrols the ones on the selected platform, in the order they are listed.
   */
  enrollableConversations: ReplyCampaignEnrollableConversation[];
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  isOpen: boolean;
  onCreate: (input: SocialReplyCampaignInput) => Promise<void> | void;
  onOpenChange: (isOpen: boolean) => void;
  onRefresh: () => void;
  onTransition: (
    campaignId: string,
    transition: SocialReplyCampaignTransition,
  ) => Promise<void> | void;
}
