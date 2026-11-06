'use client';

import type { AgentThread } from '@genfeedai/agent';
import {
  type ChildThreadGroups,
  getThreadStatusMeta,
  groupChildThreads,
  resolveThreadListPreview,
} from '@genfeedai/agent/components/agent-thread-list.helpers';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRow,
  ThreadListSection,
  ThreadListSubtitle,
  useLocalDayClock,
} from '@ui/lists/thread-list/ThreadList';
import { Button } from '@ui/primitives/button';
import Searchbar from '@ui/primitives/searchbar';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { AgentThreadsPanelProps } from '@/components/workspace-shell/props/agent-threads-panel.props';
import AgentThreadLightView from './AgentThreadLightView';

/** Open by default: what needs the operator, what runs, what just finished. */
const OPEN_GROUPS = ['needsYou', 'working', 'readyForReview'] as const;

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
 * The work queue beside the master conversation: every thread the master (or
 * the operator) started, with only what needs the operator, what is running and
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

  const groups = useMemo(
    () =>
      groupChildThreads([...allThreads], {
        brandId,
        searchQuery,
      }),
    [allThreads, brandId, searchQuery],
  );

  const openThread = openThreadId
    ? allThreads.find((thread) => thread.id === openThreadId)
    : undefined;
  if (openThread) {
    const isOpenThreadResolved =
      openThread.status === AgentThreadStatus.ARCHIVED;
    return (
      <AgentThreadLightView
        apiService={apiService}
        isPending={pendingThreadIds?.has(openThread.id)}
        isResolved={isOpenThreadResolved}
        onBack={() => setOpenThreadId(null)}
        onOpenFullThread={onOpenFullThread}
        onReopen={
          onReopenThread ? () => void onReopenThread(openThread.id) : undefined
        }
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
    return (
      <ThreadListRow
        actions={actions}
        actionsLabel={translate('actions', { title })}
        data-testid={`agent-threads-panel-thread-${thread.id}`}
        href={getThreadHref(thread.id)}
        key={thread.id}
        onSelect={() => setOpenThreadId(thread.id)}
        status={status}
        statusLabel={label}
        subtitle={
          <ThreadListSubtitle
            parts={[
              resolveThreadListPreview(thread),
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
      <div className="p-3 pb-1">
        <Searchbar
          ariaLabel={translate('search')}
          className="min-w-0"
          onChange={(event) => setSearchQuery(event.target.value)}
          onClear={() => setSearchQuery('')}
          placeholder={translate('search')}
          value={searchQuery}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3 pt-1">
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
              <p className="px-2.5 pt-2 text-sm text-muted-foreground">
                {translate('nothingNeedsYou')}
              </p>
            ) : null}
            {OPEN_GROUPS.map((key) => (
              <ThreadListSection
                data-testid={`agent-threads-panel-group-${key}`}
                itemCount={groups[key].length}
                key={sectionKey(key)}
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
              title={translate('groups.earlier')}
            >
              {groups.recent.map(renderRow)}
              {groups.resolved.length > 0 ? (
                <li className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground/70">
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
