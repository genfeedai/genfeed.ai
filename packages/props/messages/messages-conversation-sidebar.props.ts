import type { SocialConversationType } from '@genfeedai/contracts';
import type { SocialPlatform } from '@genfeedai/contracts/interfaces';
import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import type { ReactNode } from 'react';

export type MessagesInboxView =
  | 'all'
  | 'archived'
  | 'inbox'
  | 'resolved'
  | 'review'
  | 'unread';

/**
 * One mailbox stream with optional conversation-type filters. Mentions and
 * replies remain valid wire types but have no dedicated filter yet.
 */
export type MessagesSurface =
  | 'all'
  | SocialConversationType.COMMENT
  | SocialConversationType.DM;

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
  advancedFilters: ReactNode;
  brandFilter: string;
  brandOptions: readonly MessagesBrandFilterOption[];
  busyAction: string | null;
  conversations: SocialConversationModel[];
  conversationType: MessagesSurface;
  hasConnectedAccounts: boolean;
  hasSyncableAccounts: boolean;
  isAccountsLoading: boolean;
  isLoading: boolean;
  onBrandFilterChange: (brandId: string) => void;
  onConversationTypeChange: (conversationType: MessagesSurface) => void;
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
}
