import type {
  SocialAutomationState,
  SocialConversationStatus,
  SocialPlatform,
} from '@genfeedai/contracts/interfaces';

import type {
  MessagesInboxView,
  MessagesSurface,
} from '@genfeedai/props/messages/messages-conversation-sidebar.props';

export type MessagesInboxFiltersState = {
  automationState: SocialAutomationState | 'all';
  brandFilterOverride: string | null;
  brandFilterRouteKey: string | undefined;
  conversationPage: number;
  conversationType: MessagesSurface;
  credentialId: string;
  needsReviewOnly: boolean;
  platform: SocialPlatform | 'all';
  search: string;
  status: SocialConversationStatus | 'all';
  unreadOnly: boolean;
};

export type MessagesInboxFiltersAction =
  | {
      type: 'set-automation-state';
      automationState: SocialAutomationState | 'all';
    }
  | { type: 'set-brand-filter'; brandFilter: string }
  | { type: 'set-conversation-page'; page: number }
  | { type: 'set-conversation-type'; conversationType: MessagesSurface }
  | { type: 'set-credential-id'; credentialId: string }
  | { type: 'set-inbox-view'; view: MessagesInboxView }
  | { type: 'set-platform'; platform: SocialPlatform | 'all' }
  | { type: 'set-search'; search: string }
  | { type: 'step-conversation-page'; delta: number }
  | { type: 'sync-route-brand'; brandSlug: string | undefined };

export interface UseMessagesInboxFiltersParams {
  readonly brandSlug: string | undefined;
  /** Type filter seeded from the `?type=` deep link. */
  readonly initialConversationType?: MessagesSurface;
  /** Status filter seeded from the `?status=` deep link. */
  readonly initialInboxView?: MessagesInboxView;
  readonly routeBrandId: string | undefined;
}
