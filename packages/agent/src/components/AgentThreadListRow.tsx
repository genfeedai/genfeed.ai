import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadStatus, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  ArchiveX,
  CornerDownRight,
  Ellipsis,
  Pin,
  SquarePen,
  Undo2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactElement, RefObject } from 'react';
import {
  formatRelativeTime,
  getThreadStatusA11yLabel,
  getThreadStatusDotClass,
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
  getThreadHref: (threadId: string) => string;
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
 * activity disc only when running/waiting/failed (Claude-style pulse).
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
  a11yLabel,
}: {
  statusMeta: NonNullable<ReturnType<typeof getThreadStatusMeta>>;
  a11yLabel: string;
}): ReactElement {
  const dotClass = getThreadStatusDotClass({
    tone: statusMeta.tone,
  });

  return (
    <span
      className="relative mt-1.5 flex size-2 shrink-0 items-center justify-center"
      role="img"
      aria-label={a11yLabel}
      title={statusMeta.label}
    >
      {statusMeta.shouldPulse ? (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-40',
            dotClass,
          )}
          aria-hidden
        />
      ) : null}
      <span
        className={cn('relative size-2 rounded-full', dotClass)}
        aria-hidden
      />
    </span>
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
  const isActiveConversation = conv.id === activeThreadId;
  // Archived view lists only archived threads, so a stale/missing API status
  // must still render with archived chrome.
  const isArchived =
    isArchivedView || conv.status === AgentThreadStatus.ARCHIVED;
  // Treat local streaming/busy as running so the disc stays live on the open thread.
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
          shouldPulse: true,
          tone: 'running' as const,
        }
      : null);

  const relativeTime = formatRelativeTime(
    conv.lastActivityAt ?? conv.updatedAt ?? conv.createdAt,
  );
  const statusA11yLabel = getThreadStatusA11yLabel(conv, statusMeta);
  const preview = resolveThreadListPreview(conv);
  const threadTitle = conv.title || 'Untitled';
  const generatedAssetUrl = conv.lastGeneratedAssetUrl?.trim() || null;

  const activityIndicator = statusMeta ? (
    <SimpleTooltip label={statusMeta.label} position="top">
      <ThreadActivityIndicator
        statusMeta={statusMeta}
        a11yLabel={statusA11yLabel}
      />
    </SimpleTooltip>
  ) : null;

  const thumbSlot = (
    <span className="relative mt-0.5 size-8 shrink-0">
      {generatedAssetUrl ? (
        <Image
          alt={`Latest generated output for ${threadTitle}`}
          className="size-8 rounded-md object-cover"
          height={32}
          src={generatedAssetUrl}
          unoptimized
          width={32}
        />
      ) : (
        <span
          className="block size-8 rounded-md bg-foreground/[0.06]"
          aria-hidden
        />
      )}
      {activityIndicator ? (
        <span className="absolute -right-0.5 -top-0.5">
          {activityIndicator}
        </span>
      ) : null}
    </span>
  );

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
          {thumbSlot}
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
          href={getThreadHref(conv.id)}
          className="flex min-w-0 flex-1 gap-2 rounded px-2.5 py-1.5 pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          onClick={() => {
            // Do not abort an in-flight prefetch for this row. The switch
            // adopts that flight so hover-then-click cannot stack a second
            // messages+snapshot set (#2790).
            onSelect(conv);
          }}
          onPointerEnter={() => {
            onPrefetch(conv.id);
          }}
          onFocus={() => {
            onPrefetch(conv.id);
          }}
          onPointerLeave={() => {
            onCancelPrefetch(conv.id);
          }}
          onBlur={() => {
            onCancelPrefetch(conv.id);
          }}
        >
          {thumbSlot}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
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
              {relativeTime ? (
                <span className="shrink-0 text-2xs tabular-nums text-foreground/36">
                  {relativeTime}
                </span>
              ) : null}
            </div>
            {preview ? (
              <div className="mt-0.5 min-w-0 truncate text-2xs text-foreground/38">
                {preview}
              </div>
            ) : null}
          </div>
        </Link>
      )}

      <div className="absolute right-1 top-1 shrink-0">
        <DropdownMenu
          open={openMenuThreadId === conv.id}
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
                'rounded p-1 text-foreground/42 hover:bg-foreground/[0.06] hover:text-foreground/78',
                renamingThreadId === conv.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
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
