import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import {
  ArchiveX,
  CornerDownRight,
  Ellipsis,
  Pin,
  SquarePen,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactElement, RefObject } from 'react';
import {
  formatRelativeTime,
  getThreadStatusKey,
  getThreadStatusMeta,
  resolveThreadListPreview,
} from './agent-thread-list.helpers';

interface AgentThreadListRowProps {
  conv: AgentThread;
  activeThreadId: string | null;
  activeRunStatus:
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | null
    | undefined;
  isStreaming: boolean;
  threadUiBusyById: Record<string, boolean>;
  openMenuThreadId: string | null;
  renamingThreadId: string | null;
  renameDraft: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  isArchivedView: boolean;
  usesProgrammaticNavigation: boolean;
  getThreadHref: (thread: AgentThread) => string;
  onContextMenu: (event: React.MouseEvent, threadId: string) => void;
  onSelect: (thread: AgentThread) => void;
  onMenuOpenChange: (threadId: string, open: boolean) => void;
  onMenuButtonRef: (
    threadId: string,
    element: HTMLButtonElement | null,
  ) => void;
  onRenameDraftChange: (value: string) => void;
  onSubmitRename: (thread: AgentThread) => void;
  onCancelRename: () => void;
  onTogglePinned: (thread: AgentThread) => void;
  onForkThread: (thread: AgentThread) => void;
  onStartRename: (thread: AgentThread) => void;
  onArchive: (thread: AgentThread) => void;
  onUnarchive: (thread: AgentThread) => void;
  /** Hover/focus signal (#2790) — debounced inside the caller's prefetch hook. */
  onPrefetch: (threadId: string) => void;
  /** Pointer-leave/blur, or an actual click, cancels a pending/in-flight prefetch. */
  onCancelPrefetch: (threadId?: string) => void;
}

/**
 * Finalist 1 row chrome: dense title+preview+time, square active border,
 * canonical status glyph only when running/waiting/failed.
 * Archived rows use semantic surface and foreground tokens so the title stays
 * above WCAG AA without opacity stacking dimming every descendant.
 */
function agentThreadListRowClassName(options: {
  isArchived?: boolean;
  isSelected?: boolean;
}): string {
  return cn(
    'group relative w-full text-left transition-colors',
    // Square active — no purple left rail, no soft pill.
    'rounded border border-transparent',
    options.isSelected
      ? 'border-border bg-foreground/[0.06]'
      : options.isArchived
        ? 'bg-muted/50 hover:bg-muted'
        : 'hover:bg-foreground/[0.045]',
  );
}

function ThreadActivityIndicator({
  statusMeta,
}: {
  statusMeta: NonNullable<ReturnType<typeof getThreadStatusMeta>>;
}): ReactElement {
  const statusKey = getThreadStatusKey({
    tone: statusMeta.tone,
  });

  if (statusMeta.tone === 'failed') {
    return (
      <span
        aria-label={statusMeta.label}
        className="size-2 shrink-0 rounded-full bg-destructive"
        role="status"
        title={statusMeta.label}
      />
    );
  }

  if (statusMeta.tone === 'running') {
    return (
      <span
        aria-label={statusMeta.label}
        className="size-2 shrink-0 animate-pulse rounded-full bg-info motion-reduce:animate-none"
        role="status"
        title={statusMeta.label}
      />
    );
  }

  return (
    <Badge
      className="shrink-0 capitalize"
      size={ComponentSize.SM}
      status={statusKey}
    >
      {statusMeta.label}
    </Badge>
  );
}

export function AgentThreadListRow({
  conv,
  activeThreadId,
  activeRunStatus,
  isStreaming,
  threadUiBusyById,
  openMenuThreadId,
  renamingThreadId,
  renameDraft,
  renameInputRef,
  isArchivedView,
  usesProgrammaticNavigation,
  getThreadHref,
  onContextMenu,
  onSelect,
  onMenuOpenChange,
  onMenuButtonRef,
  onRenameDraftChange,
  onSubmitRename,
  onCancelRename,
  onTogglePinned,
  onForkThread,
  onStartRename,
  onArchive,
  onUnarchive,
  onPrefetch,
  onCancelPrefetch,
}: AgentThreadListRowProps): ReactElement {
  const threadHref = getThreadHref(conv);
  const prefetchThreadRoute = useNavigationPrefetch(threadHref);
  const isActiveConversation = conv.id === activeThreadId;
  // Archived view lists only archived threads, so a stale/missing API status
  // must still render with archived chrome.
  const isArchived =
    isArchivedView || conv.status === AgentThreadStatus.ARCHIVED;
  // Treat local streaming/busy as running so the glyph stays current.
  const statusMetaBase = getThreadStatusMeta(conv, {
    activeRunStatus: activeRunStatus ?? undefined,
    activeThreadId,
  });
  const isLocallyWorking =
    isActiveConversation &&
    (isStreaming ||
      activeRunStatus === 'running' ||
      activeRunStatus === 'cancelling' ||
      threadUiBusyById[conv.id] === true);
  const statusMeta =
    statusMetaBase ??
    (isLocallyWorking
      ? {
          label: 'Running',
          tone: 'running' as const,
        }
      : null);

  const relativeTime = formatRelativeTime(
    conv.lastActivityAt ?? conv.updatedAt ?? conv.createdAt,
  );
  const isMenuOpen = openMenuThreadId === conv.id;
  const shouldShowActions = renamingThreadId === conv.id || isMenuOpen;
  const preview = resolveThreadListPreview(conv);
  const threadTitle = conv.title || 'Untitled';
  const activityIndicator = statusMeta ? (
    <ThreadActivityIndicator statusMeta={statusMeta} />
  ) : null;

  return (
    <div
      key={conv.id}
      data-archived={isArchived ? 'true' : undefined}
      className={cn(
        'flex min-h-0 items-stretch',
        agentThreadListRowClassName({
          isArchived,
          isSelected: isActiveConversation,
        }),
      )}
      onContextMenu={(event) => onContextMenu(event, conv.id)}
    >
      {renamingThreadId === conv.id ? (
        <div className="flex min-h-10 flex-1 items-center gap-2 px-2.5 py-1.5">
          <Input
            ref={renameInputRef}
            aria-label={`Rename ${conv.title || 'thread'}`}
            className="min-w-0 flex-1"
            value={renameDraft}
            onBlur={() => {
              onSubmitRename(conv);
            }}
            onChange={(event) => {
              onRenameDraftChange(event.target.value);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmitRename(conv);
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelRename();
              }
            }}
          />
        </div>
      ) : (
        <Link
          href={threadHref}
          prefetch={false}
          className="flex min-w-0 flex-1 gap-2 rounded px-2.5 py-1.5 pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          onClick={(event) => {
            if (usesProgrammaticNavigation) {
              event.preventDefault();
            }
            // Do not abort an in-flight prefetch for this row. The switch
            // adopts that flight so hover-then-click cannot stack a second
            // messages+snapshot set (#2790).
            onSelect(conv);
          }}
          onPointerEnter={() => {
            prefetchThreadRoute();
            onPrefetch(conv.id);
          }}
          onFocus={() => {
            prefetchThreadRoute();
            onPrefetch(conv.id);
          }}
          onPointerLeave={() => {
            onCancelPrefetch(conv.id);
          }}
          onBlur={() => {
            onCancelPrefetch(conv.id);
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              {activityIndicator}
              {conv.isPinned ? (
                <Pin
                  className="size-3 shrink-0 -rotate-45 text-foreground/42"
                  aria-label="Pinned conversation"
                />
              ) : null}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-medium',
                  // Default studio tokens: >=7.56:1 dark and >=4.92:1 light
                  // across archived, hover, and selected row surfaces.
                  isArchived ? 'text-foreground/65' : 'text-foreground/90',
                )}
              >
                {threadTitle}
              </span>
            </div>
            {preview ? (
              <div className="mt-0.5 min-w-0 truncate text-2xs text-foreground/38">
                {preview}
              </div>
            ) : null}
          </div>
        </Link>
      )}

      <div className="pointer-events-none absolute right-1 top-1 size-7 shrink-0">
        {relativeTime ? (
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center text-2xs tabular-nums text-foreground/36 transition-opacity',
              shouldShowActions
                ? 'opacity-0'
                : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0',
            )}
          >
            {relativeTime}
          </span>
        ) : null}
        <DropdownMenu
          open={isMenuOpen}
          onOpenChange={(open) => {
            onMenuOpenChange(conv.id, open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              ref={(element) => {
                onMenuButtonRef(conv.id, element);
              }}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              withWrapper={false}
              ariaLabel={`Thread actions for ${conv.title || 'thread'}`}
              className={cn(
                'pointer-events-auto size-7 rounded-md p-1 text-foreground/42 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground/78',
                shouldShowActions
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
              )}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                onTogglePinned(conv);
              }}
            >
              <Pin className="size-4 -rotate-45" />
              {conv.isPinned ? 'Unpin conversation' : 'Pin conversation'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onForkThread(conv);
              }}
            >
              <CornerDownRight className="size-4" />
              Fork thread
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onStartRename(conv);
              }}
            >
              <SquarePen className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (isArchivedView) {
                  onUnarchive(conv);
                  return;
                }

                onArchive(conv);
              }}
            >
              {isArchivedView ? (
                <Undo2 className="size-4" />
              ) : (
                <ArchiveX className="size-4" />
              )}
              {isArchivedView ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
