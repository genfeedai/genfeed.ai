'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentDockHistoryProps } from '@props/ui/agent-dock.props';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function AgentDockHistory({
  activeThreadId,
  isThreadListLoading = false,
  onSelectThread,
  threads = [],
}: AgentDockHistoryProps) {
  const translate = useTranslations('common.agentDock');
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
      data-testid="agent-dock-history"
    >
      {isThreadListLoading ? (
        <p className="px-2 py-3 text-sm text-muted-foreground" role="status">
          {translate('threadsLoading')}
        </p>
      ) : threads.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          {translate('noThreads')}
        </p>
      ) : (
        <ul className="space-y-1">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Button
                aria-current={thread.id === activeThreadId ? 'true' : undefined}
                className="h-auto min-h-10 w-full justify-start py-3 text-left aria-[current=true]:bg-hover"
                data-testid={`agent-dock-thread-${thread.id}`}
                onClick={() => onSelectThread?.(thread.id)}
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                <span className="line-clamp-2">{thread.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
