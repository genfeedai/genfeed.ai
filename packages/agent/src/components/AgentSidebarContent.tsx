import { AgentRunsList } from '@genfeedai/agent/components/AgentRunsList';
import { AgentThreadList } from '@genfeedai/agent/components/AgentThreadList';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

interface AgentSidebarContentProps {
  apiService: AgentApiService;
  onNavigate?: (path: string) => void;
}

export function AgentSidebarContent({
  apiService,
  onNavigate,
}: AgentSidebarContentProps): ReactElement {
  const { href } = useOrgUrl();
  const translate = useTranslations('agent.chrome');
  const [listView, setListView] = useState<'conversations' | 'runs'>(
    'conversations',
  );
  const socketConnectionState = useAgentChatStore(
    (state) => state.socketConnectionState,
  );
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-2 pb-1">
        <Link
          href={href('/overview')}
          className="group flex h-8 w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-foreground/80 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Back to overview"
        >
          <ArrowLeft className="size-4 text-muted-foreground transition-colors duration-200 group-hover:text-foreground/80" />
          <span className="text-sm font-medium tracking-[-0.01em] text-foreground/90">
            {translate('title')}
          </span>
        </Link>
      </div>
      <div className="px-3 pb-2">
        <SegmentedControl
          ariaLabel={translate('title')}
          isFullWidth
          onValueChange={setListView}
          options={[
            { label: translate('conversations'), value: 'conversations' },
            { label: translate('runs'), value: 'runs' },
          ]}
          size="sm"
          value={listView}
        />
      </div>
      {listView === 'runs' ? (
        <AgentRunsList
          onNavigate={onNavigate}
          socketConnectionState={socketConnectionState}
        />
      ) : (
        <AgentThreadList apiService={apiService} onNavigate={onNavigate} />
      )}
    </div>
  );
}
