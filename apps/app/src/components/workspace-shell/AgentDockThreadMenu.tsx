'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentDockThreadMenuProps } from '@props/ui/agent-dock.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Check, ChevronDown, History, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The thread picker of the agent panel: current thread, switch, or start one. */
export default function AgentDockThreadMenu({
  activeThreadId,
  isThreadListLoading = false,
  isTriggerIconOnly = false,
  onNewThread,
  onSelectThread,
  threadTitle,
  threads = [],
}: AgentDockThreadMenuProps) {
  const translate = useTranslations('common.agentDock');
  const selectedThreadLabel =
    threadTitle ||
    threads.find((thread) => thread.id === activeThreadId)?.title ||
    translate('untitledThread');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isTriggerIconOnly ? (
          <Button
            ariaLabel={translate('threads')}
            data-testid="agent-dock-thread-history"
            icon={<History className="size-4" />}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : (
          <Button
            className="h-6 min-w-0 max-w-[14rem] px-1.5 text-xs font-normal text-muted-foreground"
            data-testid="agent-dock-thread-title"
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <span className="truncate">{selectedThreadLabel}</span>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-64 overflow-y-auto"
      >
        <DropdownMenuItem
          data-testid="agent-dock-new-thread"
          onSelect={() => onNewThread?.()}
        >
          <SquarePen aria-hidden="true" className="size-4 shrink-0" />
          {translate('newThread')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isThreadListLoading ? (
          <DropdownMenuLabel>{translate('threadsLoading')}</DropdownMenuLabel>
        ) : threads.length === 0 ? (
          <DropdownMenuLabel>{translate('noThreads')}</DropdownMenuLabel>
        ) : (
          threads.map((thread) => (
            <DropdownMenuItem
              data-testid={`agent-dock-thread-${thread.id}`}
              key={thread.id}
              onSelect={() => onSelectThread?.(thread.id)}
            >
              <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              {thread.id === activeThreadId ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <span aria-hidden="true" className="size-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
