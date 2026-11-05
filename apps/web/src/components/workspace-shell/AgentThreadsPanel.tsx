'use client';

import type { AgentThread } from '@genfeedai/agent';
import {
  getThreadStatusMeta,
  groupChildThreads,
  resolveThreadListPreview,
} from '@genfeedai/agent/components/agent-thread-list.helpers';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Searchbar from '@ui/primitives/searchbar';
import Spinner from '@ui/primitives/spinner';
import {
  hoverConcealClassName,
  hoverRevealClassName,
} from '@ui/styles/hover-reveal';
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Undo2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useState } from 'react';
import type { AgentThreadsPanelProps } from '@/components/workspace-shell/props/agent-threads-panel.props';
import AgentThreadLightView from './AgentThreadLightView';

type GroupKey =
  | 'needsYou'
  | 'working'
  | 'readyForReview'
  | 'recent'
  | 'resolved';

const GROUP_ORDER: readonly GroupKey[] = [
  'needsYou',
  'working',
  'readyForReview',
  'recent',
  'resolved',
];

/** Finished work stays out of sight until the operator asks for it. */
const COLLAPSED_BY_DEFAULT: ReadonlySet<GroupKey> = new Set(['resolved']);

function ThreadStatusIcon({
  isResolved,
  tone,
}: {
  isResolved: boolean;
  tone: 'failed' | 'running' | 'warning' | null;
}): ReactElement {
  if (!isResolved && tone === 'running') {
    return (
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        <Spinner size={ComponentSize.SM} />
      </span>
    );
  }
  if (!isResolved && tone) {
    return (
      <CircleAlert
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'failed' ? 'text-destructive' : 'text-warning',
        )}
      />
    );
  }
  return (
    <CircleCheck
      aria-hidden="true"
      className={cn(
        'mt-0.5 size-4 shrink-0',
        isResolved ? 'text-muted-foreground' : 'text-success',
      )}
    />
  );
}

/**
 * The Threads tab beside the master conversation: every thread the master (or
 * the operator) started, grouped by what needs attention, with a search box.
 * The brand is the topbar's, so the list takes it as `brandId` and has no
 * filter of its own. Picking one opens a light view with a steer box.
 */
export default function AgentThreadsPanel({
  apiService,
  brandId = null,
  isLoading = false,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [toggledGroups, setToggledGroups] = useState<
    Partial<Record<GroupKey, boolean>>
  >({});
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

  const visibleCount = GROUP_ORDER.reduce(
    (count, key) => count + groups[key].length,
    0,
  );
  const isSearching = searchQuery.trim().length > 0;

  const renderRow = (thread: AgentThread) => {
    const status = getThreadStatusMeta(thread);
    const preview = resolveThreadListPreview(thread);
    const isResolved = thread.status === AgentThreadStatus.ARCHIVED;
    const onToggleResolved = isResolved ? onReopenThread : onResolveThread;
    const toggleLabel = translate(isResolved ? 'reopen' : 'resolve');
    const title = thread.title?.trim() || translate('untitled');
    const hasStatusLabel = Boolean(status) && !isResolved;
    return (
      <li
        className="group relative rounded-lg transition-colors focus-within:bg-foreground/5 hover:bg-foreground/5"
        key={thread.id}
      >
        {/* ui-guard-allow:unstyled-look -- the row <li> owns the hover and focus look; this is its click target */}
        <Button
          className="flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          data-testid={`agent-threads-panel-thread-${thread.id}`}
          onClick={() => setOpenThreadId(thread.id)}
          textTransform="none"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <ThreadStatusIcon
            isResolved={isResolved}
            tone={status?.tone ?? null}
          />
          <span className="min-w-0 flex-1 pr-24">
            <span className="block truncate text-sm text-foreground">
              {title}
            </span>
            {preview ? (
              <span className="block truncate text-xs text-muted-foreground">
                {preview}
              </span>
            ) : null}
            {!brandId && thread.brandLabel ? (
              <span className="block truncate text-xs text-muted-foreground/70">
                {thread.brandLabel}
              </span>
            ) : null}
          </span>
        </Button>
        {hasStatusLabel ? (
          <span
            className={cn(
              'pointer-events-none absolute right-2.5 top-2 max-w-[40%] truncate text-xs text-muted-foreground',
              onToggleResolved ? hoverConcealClassName() : null,
            )}
          >
            {status?.label}
          </span>
        ) : null}
        {onToggleResolved ? (
          <Button
            aria-label={`${toggleLabel}: ${title}`}
            className={cn(
              'absolute right-1.5 top-1.5 size-7 rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
              hoverRevealClassName(),
            )}
            data-testid={`agent-threads-panel-toggle-resolved-${thread.id}`}
            isDisabled={pendingThreadIds?.has(thread.id) ?? false}
            onClick={() => void onToggleResolved(thread.id)}
            size={ButtonSize.ICON}
            tooltip={toggleLabel}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {isResolved ? (
              <Undo2 className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
          </Button>
        ) : null}
      </li>
    );
  };

  const renderGroup = (key: GroupKey) => {
    const isOpen = isSearching
      ? true
      : (toggledGroups[key] ?? !COLLAPSED_BY_DEFAULT.has(key));
    const label = translate(`groups.${key}`);
    const listId = `agent-threads-panel-list-${key}`;
    return (
      <section
        aria-label={label}
        data-testid={`agent-threads-panel-group-${key}`}
        key={key}
      >
        {/* ui-guard-allow:unstyled-look -- a disclosure header, not a standalone button */}
        <Button
          aria-controls={listId}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          data-testid={`agent-threads-panel-group-toggle-${key}`}
          onClick={() =>
            setToggledGroups((current) => ({ ...current, [key]: !isOpen }))
          }
          textTransform="none"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3 transition-transform',
              isOpen ? null : '-rotate-90',
            )}
          />
          <span>{label}</span>
          <span className="tabular-nums text-muted-foreground/70">
            · {groups[key].length}
          </span>
        </Button>
        {isOpen ? (
          <ul className="space-y-0.5" id={listId}>
            {groups[key].map(renderRow)}
          </ul>
        ) : null}
      </section>
    );
  };

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

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3 pt-1">
        {isLoading && visibleCount === 0 ? (
          <p className="px-2 text-sm text-muted-foreground" role="status">
            {translate('loading')}
          </p>
        ) : visibleCount === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">
            {isSearching ? translate('noMatches') : translate('empty')}
          </p>
        ) : (
          GROUP_ORDER.filter((key) => groups[key].length > 0).map(renderGroup)
        )}
      </div>
    </div>
  );
}
