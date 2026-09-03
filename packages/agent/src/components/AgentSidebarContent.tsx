import { AgentRunsList } from '@genfeedai/agent/components/AgentRunsList';
import { AgentThreadList } from '@genfeedai/agent/components/AgentThreadList';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useState } from 'react';

interface AgentSidebarContentProps {
  apiService: AgentApiService;
  onNavigate?: (path: string) => void;
}

export function AgentSidebarContent({
  apiService,
  onNavigate,
}: AgentSidebarContentProps): ReactElement {
  const { activeHref, href } = useOrgUrl();
  const translate = useTranslations('agent.chrome');
  const [listView, setListView] = useState<'conversations' | 'runs'>(
    'conversations',
  );
  const socketConnectionState = useAgentChatStore(
    (state) => state.socketConnectionState,
  );
  const newThreadHref = activeHref(APP_ROUTES.AGENT.NEW);
  const newThreadAction = useMemo(
    () => (
      <Link
        href={newThreadHref}
        aria-label="New agent thread"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background-secondary text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Plus className="size-4" aria-hidden="true" />
      </Link>
    ),
    [newThreadHref],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-2 pb-1">
        <Link
          href={href('/overview')}
          className="group flex h-8 w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-foreground/72 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Back to overview"
        >
          <ArrowLeft className="size-4 text-foreground/42 transition-colors duration-200 group-hover:text-foreground/78" />
          <span className="text-sm font-medium tracking-[-0.01em] text-foreground/88">
            {translate('title')}
          </span>
        </Link>
      </div>
      <div className="flex gap-1 px-3 pb-2">
        <Button
          variant={
            listView === 'conversations'
              ? ButtonVariant.SECONDARY
              : ButtonVariant.GHOST
          }
          withWrapper={false}
          onClick={() => setListView('conversations')}
        >
          {translate('conversations')}
        </Button>
        <Button
          variant={
            listView === 'runs' ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
          }
          withWrapper={false}
          onClick={() => setListView('runs')}
        >
          {translate('runs')}
        </Button>
      </div>
      {listView === 'runs' ? (
        <AgentRunsList
          onNavigate={onNavigate}
          socketConnectionState={socketConnectionState}
        />
      ) : (
        <AgentThreadList
          apiService={apiService}
          onNavigate={onNavigate}
          searchAction={newThreadAction}
          showTitle
        />
      )}
    </div>
  );
}
