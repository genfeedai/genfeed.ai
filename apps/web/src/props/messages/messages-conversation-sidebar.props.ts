import type { SocialConversationType } from '@genfeedai/contracts';
import type {
  ICredential,
  SocialAutomationState,
  SocialPlatform,
} from '@genfeedai/contracts/interfaces';
import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';

export type MessagesInboxView =
  | 'all'
  | 'archived'
  | 'inbox'
  | 'resolved'
  | 'review'
  | 'unread';

/**
 * One mailbox stream with conversation-type filters (#5502: DMs, Replies,
 * Comments). Mentions remain a valid wire type without a filter.
 */
export type MessagesSurface =
  | 'all'
  | SocialConversationType.COMMENT
  | SocialConversationType.DM
  | SocialConversationType.REPLY;

export interface PaginationState {
  hasNext: boolean;
  hasPrevious: boolean;
  page: number;
  total: number;
  totalPages: number;
}

export type MessagesBrandFilterOption = {
  id: string;
  label: string;
};

export interface MessagesConversationSidebarProps {
  accounts: readonly ICredential[];
  automationState: SocialAutomationState | 'all';
  brandFilter: string;
  brandOptions: readonly MessagesBrandFilterOption[];
  busyAction: string | null;
  conversations: SocialConversationModel[];
  conversationType: MessagesSurface;
  credentialId: string;
  defaultBrandFilter: string;
  hasConnectedAccounts: boolean;
  hasSyncableAccounts: boolean;
  isAccountsLoading: boolean;
  isLoading: boolean;
  onAutomationStateChange: (value: SocialAutomationState | 'all') => void;
  onBrandFilterChange: (brandId: string) => void;
  onClearFilters: () => void;
  onConversationTypeChange: (conversationType: MessagesSurface) => void;
  onCredentialIdChange: (credentialId: string) => void;
  onNextPage: () => void;
  onOAuthConnect?: (platform: string) => void | Promise<void>;
  onPlatformChange: (platform: SocialPlatform | 'all') => void;
  onPreviousPage: () => void;
  onSearchChange: (search: string) => void;
  onSelect: (conversationId: string) => void;
  onSync: () => void;
  onViewChange: (view: MessagesInboxView) => void;
  pagination: PaginationState;
  platform: SocialPlatform | 'all';
  search: string;
  selectedId: string | null;
  view: MessagesInboxView;
  writeBlockedReason?: string;
}
