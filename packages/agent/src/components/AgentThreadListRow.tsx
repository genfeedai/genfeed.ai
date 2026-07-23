import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';
import type { ReactElement, RefObject } from 'react';
import {
  HiArrowUturnLeft,
  HiEllipsisHorizontal,
  HiOutlineArchiveBoxXMark,
  HiOutlineArrowTurnDownRight,
  HiOutlinePencilSquare,
} from 'react-icons/hi2';
import { PiPushPinSimple } from 'react-icons/pi';
import {
  formatRelativeTime,
  getThreadStatusA11yLabel,
  getThreadStatusDotClass,
  getThreadStatusMeta,
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
}: AgentThreadListRowProps): ReactElement {
  const isActiveConversation = conv.id === activeThreadId;
  const isConversationWorking =
    conv.id === activeThreadId &&
    (isStreaming ||
      activeRunStatus === 'running' ||
      activeRunStatus === 'cancelling');
  const isThreadMarkedRunning =
    isActiveConversation &&
    (conv.runStatus === 'queued' || conv.runStatus === 'running');
  const isThreadUiBusy =
    isActiveConversation && threadUiBusyById[conv.id] === true;
  const statusMeta = getThreadStatusMeta(conv, {
    activeRunStatus: activeRunStatus ?? undefined,
    activeThreadId,
  });
  const relativeTime = formatRelativeTime(
    conv.lastActivityAt ?? conv.updatedAt ?? conv.createdAt,
  );
  const isLoadingStatus =
    isConversationWorking || isThreadMarkedRunning || isThreadUiBusy;
  const statusDotClass = getThreadStatusDotClass({
    attentionState: conv.attentionState,
    pendingInputCount: conv.pendingInputCount,
  });
  const statusA11yLabel = getThreadStatusA11yLabel(conv, statusMeta);
  const statusIndicator = isLoadingStatus ? (
    <Spinner
      size={ComponentSize.XS}
      className="shrink-0 text-foreground/45"
      ariaLabel={statusA11yLabel}
      title={statusMeta?.label ?? `${conv.title || 'Conversation'} status`}
    />
  ) : (
    <span
      className={cn(
        'size-2.5 shrink-0 rounded-full border border-foreground/15',
        statusDotClass,
      )}
      role="img"
      aria-label={statusA11yLabel}
      title={statusMeta?.label ?? `${conv.title || 'Conversation'} status`}
    />
  );

  return (
    <div
      key={conv.id}
      className={cn(
        'group relative flex h-9 w-full items-center transition-colors',
        conv.status === AgentThreadStatus.ARCHIVED && 'opacity-55',
        conv.id === activeThreadId
          ? 'bg-foreground/[0.06]'
          : 'hover:bg-foreground/[0.06]',
      )}
      onContextMenu={(event) => onContextMenu(event, conv.id)}
    >
      {renamingThreadId === conv.id ? (
        <div className="flex h-full flex-1 items-center gap-2 px-3">
          {statusIndicator}
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
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
          onClick={() => {
            onSelect(conv);
          }}
        >
          {statusMeta ? (
            <SimpleTooltip label={statusMeta.label} position="top">
              {statusIndicator}
            </SimpleTooltip>
          ) : (
            statusIndicator
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {conv.isPinned ? (
                <PiPushPinSimple
                  className="size-3 shrink-0 -rotate-45 text-foreground/42"
                  title="Pinned conversation"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
                {conv.title || 'Untitled'}
              </span>
            </div>
            {relativeTime ? (
              <span className="shrink-0 text-[11px] text-foreground/42">
                {relativeTime}
              </span>
            ) : null}
          </div>
        </Link>
      )}

      <div className="ml-1 shrink-0 self-center">
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
              <HiEllipsisHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                onTogglePinned(conv);
              }}
            >
              <PiPushPinSimple className="size-4 -rotate-45" />
              {conv.isPinned ? 'Unpin conversation' : 'Pin conversation'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onForkThread(conv);
              }}
            >
              <HiOutlineArrowTurnDownRight className="size-4" />
              Fork thread
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onStartRename(conv);
              }}
            >
              <HiOutlinePencilSquare className="size-4" />
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
                <HiArrowUturnLeft className="size-4" />
              ) : (
                <HiOutlineArchiveBoxXMark className="size-4" />
              )}
              {isArchivedView ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
