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

/**
 * The newest inbound sequence the loaded transcript is known to contain for a
 * conversation. Read receipts acknowledge only this cursor, never the
 * sequence a receipt response or a conversation refresh reports.
 */
export interface MessagesAcknowledgeableCursor {
  readonly conversationId: string;
  readonly inboundSequence: number;
}
