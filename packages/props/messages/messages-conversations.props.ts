import type { SocialInboxQuery } from '@genfeedai/contracts/interfaces';

import type { SocialMessagesService } from '@genfeedai/services/social/messages.service';

export interface UseMessagesConversationsParams {
  readonly getMessagesService: () => Promise<SocialMessagesService>;
  readonly onClearSelectedConversationParam: () => void;
  /** Called after the inbox's read state may have changed (thread read, realtime refresh). */
  readonly onUnreadStateChange?: () => void;
  readonly query: SocialInboxQuery;
  readonly requestedConversationId: string | null;
  readonly scopedOrganizationId?: string;
}
