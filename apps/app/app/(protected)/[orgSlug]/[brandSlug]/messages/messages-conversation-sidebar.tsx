'use client';

import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  Platform,
  SocialConversationType,
} from '@genfeedai/enums';
import type { SocialPlatform } from '@genfeedai/interfaces';
import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import {
  type ConversationSidebarFilter,
  ConversationSidebarFilters,
  ConversationSidebarSearch,
  ConversationSidebarSection,
  conversationSidebarRowClassName,
} from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
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

interface PaginationState {
  hasNext: boolean;
  hasPrevious: boolean;
  page: number;
  total: number;
  totalPages: number;
}

const VIEW_FILTERS: readonly ConversationSidebarFilter<MessagesInboxView>[] = [
  { label: 'Inbox', value: 'inbox' },
  { label: 'Unread', value: 'unread' },
  { label: 'Review', value: 'review' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Archived', value: 'archived' },
  { label: 'All', value: 'all' },
];

const SURFACE_FILTERS: readonly ConversationSidebarFilter<MessagesSurface>[] = [
  { label: 'All', value: 'all' },
  { label: 'Comments', value: SocialConversationType.COMMENT },
  { label: 'DMs', value: SocialConversationType.DM },
];

const PLATFORM_OPTIONS: Array<{
  label: string;
  value: SocialPlatform | 'all';
}> = [
  { label: 'All platforms', value: 'all' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'X / Twitter', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
];

function formatRelativeTime(value?: string | null): string {
  if (!value) {
    return '';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (diffMinutes < 1) {
    return 'now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

export function getParticipantLabel(
  conversation: SocialConversationModel,
): string {
  return (
    conversation.participantName ||
    conversation.participantHandle ||
    conversation.participantExternalId ||
    'Unknown sender'
  );
}

export function groupMessageConversations(
  conversations: SocialConversationModel[],
): {
  inbox: SocialConversationModel[];
  needsYou: SocialConversationModel[];
} {
  const needsYou: SocialConversationModel[] = [];
  const inbox: SocialConversationModel[] = [];

  for (const conversation of conversations) {
    if (
      conversation.unreadCount > 0 ||
      conversation.needsReview ||
      conversation.status === 'needs_review'
    ) {
      needsYou.push(conversation);
    } else {
      inbox.push(conversation);
    }
  }

  return { inbox, needsYou };
}

function ConversationRow({
  brandLabel,
  conversation,
  isDisabled,
  isSelected,
  onSelect,
}: {
  brandLabel?: string;
  conversation: SocialConversationModel;
  isDisabled: boolean;
  isSelected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  const relativeTime = formatRelativeTime(conversation.latestMessageAt);
  const needsReview =
    conversation.needsReview || conversation.status === 'needs_review';
  const participantLabel = getParticipantLabel(conversation);
  const participantInitials = participantLabel
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const isReadOnly = conversation.platform === Platform.TIKTOK;

  return (
    <Button
      aria-pressed={isSelected}
      ariaLabel={`Open social conversation with ${getParticipantLabel(conversation)}`}
      isDisabled={isDisabled}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(
        conversationSidebarRowClassName({ isSelected }),
        'flex min-h-[4.5rem] items-start gap-2.5 px-2.5 py-2 text-left',
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="relative mt-0.5 shrink-0">
        <Avatar className="size-8 bg-background-secondary shadow-border">
          {conversation.participantAvatarUrl ? (
            <AvatarImage
              alt={`${participantLabel} profile picture`}
              className="object-cover"
              src={conversation.participantAvatarUrl}
            />
          ) : null}
          <AvatarFallback className="text-2xs font-semibold text-foreground/65">
            {participantInitials || '?'}
          </AvatarFallback>
        </Avatar>
        <PlatformBadge
          className="absolute -bottom-1 -right-1 size-4 justify-center rounded-full border border-background p-0"
          platform={conversation.platform}
          showLabel={false}
          size={ComponentSize.SM}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              needsReview
                ? 'bg-warning'
                : conversation.unreadCount > 0
                  ? 'bg-info'
                  : 'bg-foreground/15',
            )}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
            {participantLabel}
          </span>
          {relativeTime ? (
            <span className="shrink-0 text-2xs tabular-nums text-foreground/34">
              {relativeTime}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-2xs text-foreground/42">
            {conversation.latestMessageText || 'No message preview available'}
          </span>
          {conversation.unreadCount > 0 ? (
            <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-info">
              {conversation.unreadCount}
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-2xs font-medium text-foreground/30">
          <span className="shrink-0 uppercase tracking-wider">
            {conversation.conversationType === SocialConversationType.DM
              ? 'DM'
              : 'Comment'}
          </span>
          {brandLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{brandLabel}</span>
            </>
          ) : null}
          {isReadOnly ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 text-warning">Read only</span>
            </>
          ) : needsReview ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 text-warning">Needs review</span>
            </>
          ) : null}
        </span>
      </span>
    </Button>
  );
}

export type MessagesBrandFilterOption = {
  id: string;
  label: string;
};

interface MessagesConversationSidebarProps {
  advancedFilters: ReactNode;
  brandFilter: string;
  brandOptions: readonly MessagesBrandFilterOption[];
  busyAction: string | null;
  connectionState: string;
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

export function MessagesConversationSidebar({
  advancedFilters,
  brandFilter,
  brandOptions,
  busyAction,
  connectionState,
  conversations,
  conversationType,
  hasConnectedAccounts,
  hasSyncableAccounts,
  isAccountsLoading,
  isLoading,
  onBrandFilterChange,
  onConversationTypeChange,
  onNextPage,
  onOAuthConnect,
  onPlatformChange,
  onPreviousPage,
  onSearchChange,
  onSelect,
  onSync,
  onViewChange,
  pagination,
  platform,
  search,
  selectedId,
  view,
}: MessagesConversationSidebarProps) {
  const groups = groupMessageConversations(conversations);
  const brandLabels = new Map(
    brandOptions.map((option) => [option.id, option.label]),
  );
  const isDmSurface = conversationType === SocialConversationType.DM;
  const syncLabel =
    conversationType === 'all'
      ? 'Sync inbox'
      : isDmSurface
        ? 'Sync direct messages'
        : 'Sync comments';
  const syncAction =
    hasSyncableAccounts && conversations.length > 0 ? (
      <Button
        ariaLabel={syncLabel}
        className="size-8 shrink-0 rounded-md border border-border bg-foreground/[0.025] text-foreground/48 hover:bg-foreground/[0.07] hover:text-foreground"
        icon={<RefreshCw className="size-4" />}
        isDisabled={Boolean(busyAction) && busyAction !== 'sync'}
        isLoading={busyAction === 'sync'}
        size={ButtonSize.ICON}
        tooltip={syncLabel}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onSync}
      />
    ) : null;
  const emptyStateTitle = !hasConnectedAccounts
    ? 'Connect your social accounts'
    : conversationType === 'all'
      ? 'No conversations yet'
      : isDmSurface
        ? 'No direct messages yet'
        : 'No comments yet';
  // DMs are polled rather than pushed, so an empty DM surface is the expected
  // state until the first sync — say so instead of implying something is wrong.
  const emptyStateBody = !hasConnectedAccounts
    ? 'Bring comments and direct messages from every connected channel into one place.'
    : !hasSyncableAccounts
      ? 'Your connected TikTok account is read-only. New conversations will appear here when available.'
      : conversationType === 'all'
        ? 'Your accounts are connected. Sync now to collect the latest comments and direct messages.'
        : isDmSurface
          ? 'Direct messages are pulled in by sync. Sync now to fill this conversation list.'
          : brandFilter === 'all'
            ? 'Sync your connected accounts to pull comments into this inbox.'
            : 'No comments for this brand yet. Sync or switch brands.';
  const singleSectionLabel =
    view === 'resolved'
      ? 'Resolved'
      : view === 'archived'
        ? 'Archived'
        : view === 'review'
          ? 'Needs review'
          : view === 'unread'
            ? 'Unread'
            : null;
  const filterAction = (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            ariaLabel="Filter social conversations"
            className="size-8 shrink-0 rounded-md border border-border bg-foreground/[0.025] text-foreground/42 hover:bg-foreground/[0.07] hover:text-foreground"
            icon={<SlidersHorizontal className="size-3.5" />}
            size={ButtonSize.ICON}
            tooltip="Filter conversations"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3 p-3">
          <p className="text-xs font-semibold text-foreground/72">
            Inbox filters
          </p>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-foreground/54">Status</p>
            <Select
              value={view}
              onValueChange={(value) => {
                onViewChange(value as MessagesInboxView);
              }}
            >
              <SelectTrigger aria-label="Filter conversations by status">
                <SelectValue placeholder="Inbox" />
              </SelectTrigger>
              <SelectContent>
                {VIEW_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {brandOptions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-foreground/54">Brand</p>
              <Select value={brandFilter} onValueChange={onBrandFilterChange}>
                <SelectTrigger aria-label="Filter conversations by brand">
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brandOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-foreground/54">Platform</p>
            <Select
              value={platform}
              onValueChange={(value) => {
                onPlatformChange(value as SocialPlatform | 'all');
              }}
            >
              <SelectTrigger aria-label="Filter conversations by platform">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {advancedFilters}
        </PopoverContent>
      </Popover>
      {syncAction}
    </div>
  );

  return (
    <nav
      aria-label="Social conversations"
      className="flex h-full min-h-0 flex-col pt-1"
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-2xs font-bold uppercase tracking-[0.15em] text-foreground/40">
          Conversations
        </span>
        {pagination.total > 0 ? (
          <span className="text-2xs tabular-nums text-foreground/28">
            {pagination.total}
          </span>
        ) : null}
      </div>
      <ConversationSidebarSearch
        action={filterAction}
        ariaLabel="Search social conversations"
        placeholder="Search messages"
        value={search}
        onChange={onSearchChange}
      />
      <ConversationSidebarFilters
        ariaLabel="Switch inbox surface"
        filters={SURFACE_FILTERS}
        value={conversationType}
        onChange={onConversationTypeChange}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-3 scrollbar-thin">
        {isLoading || (isAccountsLoading && conversations.length === 0) ? (
          <div className="p-4">
            <LazyLoadingFallback variant="minimal" />
          </div>
        ) : conversations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center"
            data-testid="messages-sidebar-empty"
          >
            <MessageSquare
              aria-hidden="true"
              className="size-8 text-foreground/20"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/60">
                {emptyStateTitle}
              </p>
              <p className="text-xs leading-5 text-foreground/38">
                {emptyStateBody}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {hasSyncableAccounts ? (
                <Button
                  ariaLabel={syncLabel}
                  isDisabled={Boolean(busyAction) && busyAction !== 'sync'}
                  isLoading={busyAction === 'sync'}
                  onClick={onSync}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                >
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                  Sync now
                </Button>
              ) : !hasConnectedAccounts && onOAuthConnect ? (
                <AgentOAuthConnectMenu
                  hideIcon
                  onOAuthConnect={onOAuthConnect}
                  triggerLabel="Connect accounts"
                  triggerSize={ButtonSize.SM}
                  triggerVariant={ButtonVariant.DEFAULT}
                />
              ) : null}
              {hasConnectedAccounts && onOAuthConnect ? (
                <AgentOAuthConnectMenu
                  hideIcon
                  onOAuthConnect={onOAuthConnect}
                  triggerLabel="Connect another"
                  triggerSize={ButtonSize.SM}
                  triggerVariant={ButtonVariant.GHOST}
                />
              ) : null}
              {!hasConnectedAccounts && !onOAuthConnect ? (
                <p className="text-2xs leading-4 text-warning">
                  Choose a brand in Filters before connecting an account.
                </p>
              ) : null}
            </div>
          </div>
        ) : singleSectionLabel ? (
          <ConversationSidebarSection
            count={conversations.length}
            label={singleSectionLabel}
          >
            {conversations.map((conversation) => (
              <ConversationRow
                brandLabel={
                  conversation.brandId
                    ? brandLabels.get(conversation.brandId)
                    : undefined
                }
                conversation={conversation}
                isDisabled={Boolean(busyAction)}
                isSelected={conversation.id === selectedId}
                key={conversation.id}
                onSelect={onSelect}
              />
            ))}
          </ConversationSidebarSection>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.needsYou.length > 0 ? (
              <ConversationSidebarSection
                count={groups.needsYou.length}
                label="Needs you"
              >
                {groups.needsYou.map((conversation) => (
                  <ConversationRow
                    brandLabel={
                      conversation.brandId
                        ? brandLabels.get(conversation.brandId)
                        : undefined
                    }
                    conversation={conversation}
                    isDisabled={Boolean(busyAction)}
                    isSelected={conversation.id === selectedId}
                    key={conversation.id}
                    onSelect={onSelect}
                  />
                ))}
              </ConversationSidebarSection>
            ) : null}
            {groups.inbox.length > 0 ? (
              <ConversationSidebarSection
                count={groups.inbox.length}
                label={view === 'all' ? 'Other' : 'Inbox'}
              >
                {groups.inbox.map((conversation) => (
                  <ConversationRow
                    brandLabel={
                      conversation.brandId
                        ? brandLabels.get(conversation.brandId)
                        : undefined
                    }
                    conversation={conversation}
                    isDisabled={Boolean(busyAction)}
                    isSelected={conversation.id === selectedId}
                    key={conversation.id}
                    onSelect={onSelect}
                  />
                ))}
              </ConversationSidebarSection>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center border-t border-border px-3 py-2">
        {pagination.totalPages > 1 ? (
          <>
            <Button
              ariaLabel="Previous conversations page"
              icon={<ChevronLeft className="size-4" />}
              isDisabled={!pagination.hasPrevious}
              onClick={onPreviousPage}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <span className="flex-1 text-center text-xs text-foreground/38">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              ariaLabel="Next conversations page"
              icon={<ChevronRight className="size-4" />}
              isDisabled={!pagination.hasNext}
              onClick={onNextPage}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </>
        ) : (
          <span className="flex-1 text-xs text-foreground/32">
            {pagination.total} conversation
            {pagination.total === 1 ? '' : 's'}
          </span>
        )}
        <span
          aria-live="polite"
          className="ml-2 flex items-center gap-1.5 text-2xs capitalize text-foreground/30"
          role="status"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              connectionState === 'connected'
                ? 'bg-success'
                : 'bg-foreground/20',
            )}
          />
          {connectionState}
        </span>
      </div>
    </nav>
  );
}
