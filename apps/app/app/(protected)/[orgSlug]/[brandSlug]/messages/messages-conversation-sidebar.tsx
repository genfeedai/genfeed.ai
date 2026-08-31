'use client';

import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import {
  ButtonSize,
  ButtonVariant,
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
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
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
  conversation,
  isDisabled,
  isSelected,
  onSelect,
}: {
  conversation: SocialConversationModel;
  isDisabled: boolean;
  isSelected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  const relativeTime = formatRelativeTime(conversation.latestMessageAt);
  const needsReview =
    conversation.needsReview || conversation.status === 'needs_review';

  return (
    <Button
      aria-pressed={isSelected}
      ariaLabel={`Open social conversation with ${getParticipantLabel(conversation)}`}
      isDisabled={isDisabled}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(
        conversationSidebarRowClassName({ isSelected }),
        'block min-h-16 px-3 py-2',
      )}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full border border-foreground/15',
            needsReview
              ? 'bg-warning'
              : conversation.unreadCount > 0
                ? 'bg-info'
                : 'bg-foreground/10',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
          {getParticipantLabel(conversation)}
        </span>
        {relativeTime ? (
          <span className="shrink-0 text-2xs text-foreground/34">
            {relativeTime}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-2xs text-foreground/42">
          {conversation.latestMessageText || 'No message preview available'}
        </span>
        {conversation.unreadCount > 0 ? (
          <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-info">
            {conversation.unreadCount}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex items-center gap-1.5 pl-4 text-2xs font-medium uppercase tracking-wider text-foreground/28">
        <span>{conversation.platform}</span>
        <span aria-hidden="true">·</span>
        <span>
          {conversation.conversationType === SocialConversationType.DM
            ? 'DM'
            : 'Comment'}
        </span>
        <span aria-hidden="true">·</span>
        <span
          className={cn(
            needsReview && 'text-warning',
            conversation.status === 'resolved' && 'text-success',
          )}
        >
          {needsReview ? 'Needs review' : conversation.status}
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
  isLoading: boolean;
  onBrandFilterChange: (brandId: string) => void;
  onConversationTypeChange: (conversationType: MessagesSurface) => void;
  onNextPage: () => void;
  onOAuthConnect: (platform: string) => void | Promise<void>;
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
  const filters = VIEW_FILTERS.map((filter) => {
    if (filter.value === 'unread') {
      return {
        ...filter,
        count: conversations.filter(
          (conversation) => conversation.unreadCount > 0,
        ).length,
      };
    }
    if (filter.value === 'review') {
      return {
        ...filter,
        count: conversations.filter(
          (conversation) =>
            conversation.needsReview || conversation.status === 'needs_review',
        ).length,
      };
    }
    return filter;
  });
  const isDmSurface = conversationType === SocialConversationType.DM;
  const syncLabel =
    conversationType === 'all'
      ? 'Sync inbox'
      : isDmSurface
        ? 'Sync direct messages'
        : 'Sync comments';
  const syncAction = (
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
  );
  const emptyStateTitle =
    conversationType === 'all'
      ? 'No inbox items yet'
      : isDmSurface
        ? 'No direct messages yet'
        : 'No comments yet';
  // DMs are polled rather than pushed, so an empty DM surface is the expected
  // state until the first sync — say so instead of implying something is wrong.
  const emptyStateBody =
    conversationType === 'all'
      ? 'Connect a social account, then sync to collect comments and direct messages in one inbox.'
      : isDmSurface
        ? 'Direct messages are pulled in by sync. Connect an account, then sync to fill this thread list.'
        : brandFilter === 'all'
          ? 'Connect a social account, then sync to pull comments into this inbox.'
          : 'No comments for this brand yet. Connect accounts, sync, or switch brands.';
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

  return (
    <nav
      aria-label="Social conversations"
      className="flex h-full min-h-0 flex-col pt-2"
    >
      <ConversationSidebarSearch
        action={syncAction}
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
      <ConversationSidebarFilters
        ariaLabel="Filter social conversations"
        filters={filters}
        value={view}
        onChange={onViewChange}
      />
      <div className="space-y-2 px-3 pb-2">
        {brandOptions.length > 0 ? (
          <Select value={brandFilter} onValueChange={onBrandFilterChange}>
            <SelectTrigger
              aria-label="Filter conversations by brand"
              className="h-7 w-full rounded-md border-border bg-foreground/[0.025] px-2.5 text-2xs text-foreground/58"
            >
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
        ) : null}
        <div className="flex gap-2">
          <Select
            value={platform}
            onValueChange={(value) => {
              onPlatformChange(value as SocialPlatform | 'all');
            }}
          >
            <SelectTrigger
              aria-label="Filter conversations by platform"
              className="h-7 min-w-0 flex-1 rounded-md border-border bg-foreground/[0.025] px-2.5 text-2xs text-foreground/58"
            >
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                ariaLabel="Open advanced message filters"
                className="size-7 shrink-0 rounded-md border border-border bg-foreground/[0.025] text-foreground/42 hover:bg-foreground/[0.07] hover:text-foreground"
                icon={<SlidersHorizontal className="size-3.5" />}
                size={ButtonSize.ICON}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <p className="mb-3 text-xs font-semibold text-foreground/72">
                Advanced filters
              </p>
              {advancedFilters}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3 scrollbar-thin">
        {isLoading ? (
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
              <AgentOAuthConnectMenu
                hideIcon
                onOAuthConnect={onOAuthConnect}
                triggerLabel="Connect accounts"
                triggerSize={ButtonSize.SM}
                triggerVariant={ButtonVariant.SECONDARY}
              />
              <Button
                isDisabled={Boolean(busyAction) && busyAction !== 'sync'}
                isLoading={busyAction === 'sync'}
                onClick={onSync}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                Sync
              </Button>
            </div>
          </div>
        ) : singleSectionLabel ? (
          <ConversationSidebarSection
            count={conversations.length}
            label={singleSectionLabel}
          >
            {conversations.map((conversation) => (
              <ConversationRow
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
