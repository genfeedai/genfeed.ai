'use client';

import type { AgentThread } from '@genfeedai/agent';
import {
  type ChildThreadGroups,
  getThreadStatusMeta,
  groupChildThreads,
  resolveThreadListPreview,
} from '@genfeedai/agent/components/agent-thread-list.helpers';
import {
  AgentThreadAccessLevel,
  AgentThreadOwnerFilter,
  AgentThreadShareScope,
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import SearchField from '@ui/content/search-field/SearchField';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRow,
  ThreadListSection,
  ThreadListSubtitle,
  useLocalDayClock,
} from '@ui/lists/thread-list/ThreadList';
import FilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { AgentThreadsPanelProps } from '@/components/workspace-shell/props/agent-threads-panel.props';
import { useAgentThreadMembers } from '@/components/workspace-shell/use-agent-thread-members';
import { useAgentThreadOwnerFilter } from '@/components/workspace-shell/use-agent-thread-owner-filter';
import AgentThreadLightView from './AgentThreadLightView';

/** Open by default: what needs the operator, what runs, what just finished. */
const OPEN_GROUPS = ['needsYou', 'working', 'readyForReview'] as const;

/** Thread ids in the order the panel lists them, for a Shift-click range. */
function listedThreadIds(groups: ChildThreadGroups): string[] {
  return [
    ...groups.needsYou,
    ...groups.working,
    ...groups.readyForReview,
    ...groups.recent,
    ...groups.resolved,
  ].map((thread) => thread.id);
}

function countThreads(groups: ChildThreadGroups): number {
  return (
    groups.needsYou.length +
    groups.working.length +
    groups.readyForReview.length +
    groups.recent.length +
    groups.resolved.length
  );
}

/**
 * The work queue: beside the master conversation in the split, and in the left
 * column at full size. Every thread the master (or the operator) started, with only what needs the operator, what is running and
 * what is ready for review in sight. Everything older folds under Earlier, and
 * a search reaches it. The brand is the topbar's, so the list takes it as
 * `brandId` and has no filter of its own. Picking a thread opens it in place,
 * where it can be steered and its plan approved.
 */
export default function AgentThreadsPanel({
  apiService,
  brandId = null,
  getThreadHref,
  hasMoreResolved = false,
  isLoading = false,
  isLoadingMoreResolved = false,
  onLoadMoreResolved,
  onOpenFullThread,
  onOpenThreadChange,
  onReopenThread,
  onResolveThread,
  openThreadId: controlledOpenThreadId,
  pendingThreadIds,
  resolvedThreads,
  threads,
}: AgentThreadsPanelProps) {
  const translate = useTranslations('common.agentThreads');
  const locale = useLocale();
  const now = useLocalDayClock();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    null,
  );
  const [isBulkPending, setIsBulkPending] = useState(false);
  const { ownerFilter, setOwnerFilter } = useAgentThreadOwnerFilter();
  const [localOpenThreadId, setLocalOpenThreadId] = useState<string | null>(
    null,
  );
  const openThreadId =
    controlledOpenThreadId !== undefined
      ? controlledOpenThreadId
      : localOpenThreadId;
  const setOpenThreadId = (threadId: string | null) => {
    setLocalOpenThreadId(threadId);
    onOpenThreadChange?.(threadId);
  };

  // One list: the store's threads, plus resolved ones it never loaded. A thread
  // the store knows keeps the store's status, so a reopen shows at once.
  const allThreads = useMemo(() => {
    const known = new Set(threads.map((thread) => thread.id));
    return [
      ...threads,
      ...(resolvedThreads ?? []).filter((thread) => !known.has(thread.id)),
    ];
  }, [resolvedThreads, threads]);

  // A thread is the viewer's own unless a share reaches them. The list already
  // carries both, so the owner filter only narrows it.
  const isSharedWithViewer = (thread: AgentThread) =>
    thread.accessLevel !== undefined &&
    thread.accessLevel !== AgentThreadAccessLevel.OWNER;
  // What an owned thread is shared with, for its subtitle; private rows say nothing.
  const resolveShareScopeLabel = (thread: AgentThread): string | null => {
    if (!thread.shareScope) {
      return null;
    }
    const scope =
      thread.shareScope === AgentThreadShareScope.ORGANIZATION
        ? translate('share.scopeOrganization')
        : thread.shareScope === AgentThreadShareScope.BRAND
          ? thread.brandLabel?.trim() || translate('share.scopeBrand')
          : translate('share.scopePeople', { count: thread.shareCount ?? 1 });
    return translate('share.sharedScope', { scope });
  };
  const hasSharedThreads = allThreads.some(isSharedWithViewer);
  const {
    isFailed: isMembersFailed,
    isLoading: isMembersLoading,
    members,
    membersById,
    retry: retryMembers,
  } = useAgentThreadMembers(hasSharedThreads || Boolean(openThreadId));
  const listedThreads = useMemo(
    () =>
      ownerFilter === AgentThreadOwnerFilter.ALL
        ? allThreads
        : allThreads.filter(
            (thread) =>
              (ownerFilter === AgentThreadOwnerFilter.SHARED) ===
              (thread.accessLevel !== undefined &&
                thread.accessLevel !== AgentThreadAccessLevel.OWNER),
          ),
    [allThreads, ownerFilter],
  );

  const groups = useMemo(
    () =>
      groupChildThreads([...listedThreads], {
        brandId,
        searchQuery,
      }),
    [brandId, listedThreads, searchQuery],
  );

  const isSelecting = selectedIds.size > 0;
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionAnchorId(null);
  };
  // use-effect-audit: ignore subscribes to document keydown while selecting
  useEffect(() => {
    if (!isSelecting) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedIds(new Set());
        setSelectionAnchorId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSelecting]);

  const openThread = openThreadId
    ? allThreads.find((thread) => thread.id === openThreadId)
    : undefined;
  if (openThread) {
    const isOpenThreadResolved =
      openThread.status === AgentThreadStatus.ARCHIVED;
    return (
      <AgentThreadLightView
        apiService={apiService}
        isMembersFailed={isMembersFailed}
        isMembersLoading={isMembersLoading}
        isPending={pendingThreadIds?.has(openThread.id)}
        isResolved={isOpenThreadResolved}
        key={openThread.id}
        members={members}
        membersById={membersById}
        onBack={() => setOpenThreadId(null)}
        onOpenFullThread={onOpenFullThread}
        onReopen={
          onReopenThread ? () => void onReopenThread(openThread.id) : undefined
        }
        onRetryMembers={retryMembers}
        onResolve={
          onResolveThread
            ? () => void onResolveThread(openThread.id)
            : undefined
        }
        thread={openThread}
      />
    );
  }

  const visibleCount = countThreads(groups);
  const orderedIds = listedThreadIds(groups);
  const threadsById = new Map(allThreads.map((thread) => [thread.id, thread]));
  const selectedThreads = [...selectedIds]
    .map((id) => threadsById.get(id))
    .filter((thread): thread is AgentThread => thread !== undefined);
  const areAllSelectedResolved =
    selectedThreads.length > 0 &&
    selectedThreads.every(
      (thread) => thread.status === AgentThreadStatus.ARCHIVED,
    );
  const toggleThread = (threadId: string, isRange: boolean) => {
    const next = new Set(selectedIds);
    const anchorIndex = selectionAnchorId
      ? orderedIds.indexOf(selectionAnchorId)
      : -1;
    const targetIndex = orderedIds.indexOf(threadId);
    if (isRange && anchorIndex !== -1 && targetIndex !== -1) {
      const [from, to] =
        anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
      for (const id of orderedIds.slice(from, to + 1)) {
        next.add(id);
      }
    } else if (next.has(threadId)) {
      next.delete(threadId);
    } else {
      next.add(threadId);
    }
    setSelectedIds(next);
    setSelectionAnchorId(threadId);
  };
  const toggleGroup = (threads: readonly AgentThread[]) => {
    const next = new Set(selectedIds);
    const isAllSelected = threads.every((thread) => next.has(thread.id));
    for (const thread of threads) {
      if (isAllSelected) {
        next.delete(thread.id);
      } else {
        next.add(thread.id);
      }
    }
    setSelectedIds(next);
  };
  const groupSelection = (label: string, threads: readonly AgentThread[]) => {
    const selectedCount = threads.filter((thread) =>
      selectedIds.has(thread.id),
    ).length;
    return {
      isAllSelected: threads.length > 0 && selectedCount === threads.length,
      isSomeSelected: selectedCount > 0 && selectedCount < threads.length,
      label: translate('selection.selectGroup', { group: label }),
      onToggle: () => toggleGroup(threads),
    };
  };
  const runBulk = async () => {
    const handler = areAllSelectedResolved ? onReopenThread : onResolveThread;
    if (!handler) {
      return;
    }
    const targets = selectedThreads.filter(
      (thread) =>
        (thread.status === AgentThreadStatus.ARCHIVED) ===
        areAllSelectedResolved,
    );
    setIsBulkPending(true);
    await Promise.allSettled(targets.map((thread) => handler(thread.id)));
    setIsBulkPending(false);
    clearSelection();
  };
  const isSearching = searchQuery.trim().length > 0;
  const earlierCount = groups.recent.length + groups.resolved.length;
  const isQueueClear = OPEN_GROUPS.every((key) => groups[key].length === 0);

  const describeStatus = (
    thread: AgentThread,
  ): { label: string; status: ThreadListStatus } => {
    if (thread.status === AgentThreadStatus.ARCHIVED) {
      return { label: translate('resolved'), status: 'resolved' };
    }
    const meta = getThreadStatusMeta(thread);
    if (meta?.tone === 'warning') {
      return { label: meta.label, status: 'attention' };
    }
    if (meta?.tone === 'running') {
      return { label: meta.label, status: 'running' };
    }
    if (meta?.tone === 'failed') {
      return { label: meta.label, status: 'failed' };
    }
    if (thread.attentionState === 'updated') {
      return { label: translate('groups.readyForReview'), status: 'done' };
    }
    return thread.runStatus === 'completed'
      ? { label: translate('statusDone'), status: 'done' }
      : { label: translate('statusIdle'), status: 'idle' };
  };

  const renderRow = (thread: AgentThread) => {
    const { label, status } = describeStatus(thread);
    const title = thread.title?.trim() || translate('untitled');
    const isResolved = thread.status === AgentThreadStatus.ARCHIVED;
    const onToggleResolved = isResolved ? onReopenThread : onResolveThread;
    const actions: CollectionOverflowAction[] = [];
    if (onToggleResolved) {
      actions.push({
        id: isResolved ? 'reopen' : 'resolve',
        isDisabled: pendingThreadIds?.has(thread.id) ?? false,
        label: translate(isResolved ? 'reopen' : 'resolve'),
        onSelect: () => void onToggleResolved(thread.id),
      });
    }
    if (onOpenFullThread) {
      actions.push({
        id: 'open-full',
        label: translate('openFull'),
        onSelect: () => onOpenFullThread(thread.id),
      });
    }
    const isShared = isSharedWithViewer(thread);
    const owner =
      isShared && thread.userId ? membersById.get(thread.userId) : undefined;
    const preview = resolveThreadListPreview(thread);
    return (
      <ThreadListRow
        actions={actions}
        actionsLabel={translate('actions', { title })}
        data-testid={`agent-threads-panel-thread-${thread.id}`}
        href={getThreadHref(thread.id)}
        key={thread.id}
        leading={
          isShared ? (
            <Avatar
              className="mt-0.5"
              name={owner?.name}
              size="xs"
              src={owner?.avatarUrl}
            />
          ) : null
        }
        onSelect={() => setOpenThreadId(thread.id)}
        selection={{
          isSelected: selectedIds.has(thread.id),
          isSelecting,
          label: translate('selection.select', { title }),
          onToggle: ({ isRange }) => toggleThread(thread.id, isRange),
        }}
        status={status}
        statusLabel={label}
        subtitle={
          <ThreadListSubtitle
            parts={[
              owner?.name,
              isShared ? null : resolveShareScopeLabel(thread),
              preview,
              brandId ? null : thread.brandLabel,
            ]}
          />
        }
        time={formatThreadTime(
          thread.lastActivityAt ?? thread.updatedAt,
          locale,
          now,
        )}
        title={title}
      />
    );
  };

  // A search unfolds every group, so a match is never hidden; clearing it
  // puts the groups back the way they start.
  const sectionKey = (key: string) => `${key}:${isSearching}`;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="agent-threads-panel"
    >
      {isSelecting ? (
        <div
          aria-label={translate('selection.toolbar')}
          className="flex h-[3.25rem] shrink-0 items-center gap-2 px-3"
          data-testid="agent-threads-panel-bulk-bar"
          role="toolbar"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {translate('selection.count', { count: selectedIds.size })}
          </span>
          {onResolveThread || onReopenThread ? (
            <Button
              isLoading={isBulkPending}
              onClick={() => void runBulk()}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              {translate(areAllSelectedResolved ? 'reopen' : 'resolve')}
            </Button>
          ) : null}
          <Button
            isDisabled={isBulkPending}
            onClick={clearSelection}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {translate('selection.clear')}
          </Button>
        </div>
      ) : (
        <div className="p-2 pb-1">
          <SearchField
            ariaLabel={translate('search')}
            className="w-full"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={translate('search')}
            value={searchQuery}
          >
            <FilterMenu
              isAttached
              facets={[
                {
                  defaultValue: AgentThreadOwnerFilter.ALL,
                  key: 'owner',
                  label: translate('filters.owner'),
                  onChange: (value) =>
                    setOwnerFilter(value as AgentThreadOwnerFilter),
                  options: [
                    {
                      label: translate('filters.ownerAll'),
                      value: AgentThreadOwnerFilter.ALL,
                    },
                    {
                      label: translate('filters.ownerMine'),
                      value: AgentThreadOwnerFilter.MINE,
                    },
                    {
                      label: translate('filters.ownerShared'),
                      value: AgentThreadOwnerFilter.SHARED,
                    },
                  ],
                  selection: 'single',
                  value: ownerFilter,
                },
              ]}
              onClear={() => setOwnerFilter(AgentThreadOwnerFilter.ALL)}
            />
          </SearchField>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2 pt-1">
        {isLoading && visibleCount === 0 ? (
          <p className="px-2 text-sm text-muted-foreground" role="status">
            {translate('loading')}
          </p>
        ) : visibleCount === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">
            {isSearching ? translate('noMatches') : translate('empty')}
          </p>
        ) : (
          <>
            {isQueueClear && !isSearching ? (
              <p className="px-2 pt-2 text-sm text-muted-foreground">
                {translate('nothingNeedsYou')}
              </p>
            ) : null}
            {OPEN_GROUPS.map((key) => (
              <ThreadListSection
                data-testid={`agent-threads-panel-group-${key}`}
                itemCount={groups[key].length}
                key={sectionKey(key)}
                selection={
                  isSelecting
                    ? groupSelection(translate(`groups.${key}`), groups[key])
                    : undefined
                }
                title={translate(`groups.${key}`)}
              >
                {groups[key].map(renderRow)}
              </ThreadListSection>
            ))}
            <ThreadListSection
              data-testid="agent-threads-panel-group-earlier"
              isDefaultCollapsed={!isSearching}
              itemCount={earlierCount}
              key={sectionKey('earlier')}
              selection={
                isSelecting
                  ? groupSelection(translate('groups.earlier'), [
                      ...groups.recent,
                      ...groups.resolved,
                    ])
                  : undefined
              }
              title={translate('groups.earlier')}
            >
              {groups.recent.map(renderRow)}
              {groups.resolved.length > 0 ? (
                <li className="px-2 pb-1 pt-2 text-xs text-muted-foreground/70">
                  {translate('groups.resolved')}
                </li>
              ) : null}
              {groups.resolved.map(renderRow)}
              {hasMoreResolved && onLoadMoreResolved ? (
                <li>
                  <Button
                    className="w-full justify-center"
                    isLoading={isLoadingMoreResolved}
                    onClick={() => void onLoadMoreResolved()}
                    size={ButtonSize.SM}
                    textTransform="none"
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    {translate('loadMoreResolved')}
                  </Button>
                </li>
              ) : null}
            </ThreadListSection>
          </>
        )}
      </div>
    </div>
  );
}
