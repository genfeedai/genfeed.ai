'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
import type { ReactNode } from 'react';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';

export type MessagesInboxView =
  | 'all'
  | 'archived'
  | 'inbox'
  | 'resolved'
  | 'review'
  | 'unread';

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
          <span className="shrink-0 text-[11px] text-foreground/34">
            {relativeTime}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/42">
          {conversation.latestMessageText || 'No message preview available'}
        </span>
        {conversation.unreadCount > 0 ? (
          <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-info">
            {conversation.unreadCount}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex items-center gap-1.5 pl-4 text-[10px] font-medium uppercase tracking-wider text-foreground/28">
        <span>{conversation.platform}</span>
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

interface MessagesConversationSidebarProps {
  advancedFilters: ReactNode;
  busyAction: string | null;
  connectionState: string;
  conversations: SocialConversationModel[];
  isLoading: boolean;
  onNextPage: () => void;
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
  busyAction,
  connectionState,
  conversations,
  isLoading,
  onNextPage,
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
  const syncAction = (
    <Button
      ariaLabel="Sync social messages"
      className="size-8 shrink-0 rounded-md border border-border bg-foreground/[0.025] text-foreground/48 hover:bg-foreground/[0.07] hover:text-foreground"
      icon={<HiOutlineArrowPath className="size-4" />}
      isDisabled={Boolean(busyAction) && busyAction !== 'sync'}
      isLoading={busyAction === 'sync'}
      size={ButtonSize.ICON}
      tooltip="Sync social messages"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onSync}
    />
  );
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
        ariaLabel="Filter social conversations"
        filters={filters}
        value={view}
        onChange={onViewChange}
      />
      <div className="px-3 pb-2">
        <div className="flex gap-2">
          <Select
            value={platform}
            onValueChange={(value) => {
              onPlatformChange(value as SocialPlatform | 'all');
            }}
          >
            <SelectTrigger
              aria-label="Filter conversations by platform"
              className="h-7 min-w-0 flex-1 rounded-md border-border bg-foreground/[0.025] px-2.5 text-[11px] text-foreground/58"
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
                icon={<HiOutlineAdjustmentsHorizontal className="size-3.5" />}
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
          <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
            <HiOutlineChatBubbleLeftRight className="mb-3 size-8 text-foreground/20" />
            <p className="text-sm text-foreground/50">No messages found</p>
            <p className="mt-1 text-xs text-foreground/30">
              New social conversations will appear here after sync.
            </p>
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
              icon={<HiOutlineChevronLeft className="size-4" />}
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
              icon={<HiOutlineChevronRight className="size-4" />}
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
          className="ml-2 flex items-center gap-1.5 text-[10px] capitalize text-foreground/30"
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
