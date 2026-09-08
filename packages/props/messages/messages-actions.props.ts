import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import type { MessagesSurface } from '@genfeedai/props/messages/messages-conversation-sidebar.props';
import type { SocialMessagesService } from '@genfeedai/services/social/messages.service';

export interface UseMessagesActionsParams {
  readonly canAttachReferences: boolean;
  /** Which inbox surface is open — decides what a sync actually sweeps. */
  readonly conversationType: MessagesSurface;
  readonly getMessagesService: () => Promise<SocialMessagesService>;
  readonly loadConversations: (signal?: AbortSignal) => Promise<void>;
  readonly onLoadError?: (message: string | null) => void;
  readonly refreshSelectedThread: () => Promise<void>;
  readonly selectedConversation: SocialConversationModel | null;
  readonly selectedId: string | null;
}
