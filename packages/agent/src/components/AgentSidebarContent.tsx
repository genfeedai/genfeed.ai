import {
  AGENT_REFRESH_CONVERSATIONS_EVENT,
  AgentThreadList,
} from '@genfeedai/agent/components/AgentThreadList';
import { Kbd } from '@genfeedai/ui';
import {
  AGENT_SIDEBAR_TRANSITION_DURATION_MS,
  AGENT_SIDEBAR_TRANSITION_EASING,
} from '@genfeedai/agent/constants/agent-panel.constant';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import Link from 'next/link';
import { type ReactElement } from 'react';
import { HiArrowLeft, HiArrowPath, HiPlus } from 'react-icons/hi2';

interface AgentSidebarContentProps {
  apiService: AgentApiService;
  onNavigate?: (path: string) => void;
}

export function AgentSidebarContent({
  apiService,
  onNavigate,
}: AgentSidebarContentProps): ReactElement {
  const { href, orgHref } = useOrgUrl();

  const handleRefreshThreads = () => {
    window.dispatchEvent(new Event(AGENT_REFRESH_CONVERSATIONS_EVENT));
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
    );
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{
        animation: `agentSidebarFadeIn ${AGENT_SIDEBAR_TRANSITION_DURATION_MS}ms ${AGENT_SIDEBAR_TRANSITION_EASING}`,
      }}
    >
      <style>{`
        @keyframes agentSidebarFadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="px-3 pt-2 pb-1">
        <Link
          href={href('/overview')}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 group cursor-pointer text-white/80 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Back to overview"
        >
          <HiArrowLeft className="h-4 w-4 text-white/60 group-hover:text-white transition-colors duration-200" />
          <span className="text-sm font-medium text-white/90">Agent</span>
        </Link>
      </div>
      <div className="px-3 py-2">
        <SidebarSearchTrigger onClick={handleOpenSearch} />
      </div>
      <div className="px-3 pb-2">
        <ul className="flex flex-col gap-0.5">
          <li className="list-none">
            <Link
              href={orgHref('/chat/new')}
              className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 group cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HiPlus className="h-4 w-4 text-white/80 group-hover:text-white" />
              <span className="text-sm font-medium text-white/90">
                New Chat
              </span>
              <Kbd variant="ghost" className="ml-auto text-[11px] opacity-0 transition-opacity duration-200 group-hover:text-white/50 group-hover:opacity-100">
                ⌘⇧N
              </Kbd>
            </Link>
          </li>
          <li className="list-none">
            <button
              type="button"
              onClick={handleRefreshThreads}
              className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 group cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HiArrowPath className="h-4 w-4 text-white/80 group-hover:text-white" />
              <span className="text-sm font-medium text-white/90">Refresh</span>
            </button>
          </li>
        </ul>
      </div>
      <div className="border-t border-white/[0.08] py-2" />
      <AgentThreadList apiService={apiService} onNavigate={onNavigate} />
    </div>
  );
}
