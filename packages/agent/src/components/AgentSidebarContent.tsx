import {
  AGENT_REFRESH_CONVERSATIONS_EVENT,
  AgentThreadList,
} from '@genfeedai/agent/components/AgentThreadList';
import {
  AGENT_SIDEBAR_TRANSITION_DURATION_MS,
  AGENT_SIDEBAR_TRANSITION_EASING,
} from '@genfeedai/agent/constants/agent-panel.constant';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { Kbd } from '@genfeedai/ui';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactElement } from 'react';
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
          className="group flex h-8 w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-foreground/72 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Back to overview"
        >
          <HiArrowLeft className="size-4 text-foreground/42 transition-colors duration-200 group-hover:text-foreground/78" />
          <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/88">
            Agent
          </span>
        </Link>
      </div>
      <div className="px-3 py-2">
        <SidebarSearchTrigger onClick={handleOpenSearch} />
      </div>
      <div className="px-3 pb-2">
        <ul className="flex flex-col gap-0.5">
          <li className="list-none">
            <Link
              href={orgHref(APP_ROUTES.AGENT.NEW)}
              className="group flex h-8 w-full cursor-pointer items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/72 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HiPlus className="size-4 text-foreground/42 group-hover:text-foreground/78" />
              <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/88">
                New Thread
              </span>
              <Kbd
                variant="ghost"
                className="ml-auto rounded-md border border-border bg-foreground/[0.03] text-[10px] text-foreground/36 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              >
                ⌘⇧N
              </Kbd>
            </Link>
          </li>
          <li className="list-none">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={handleRefreshThreads}
              className="group flex h-8 w-full cursor-pointer items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/72 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HiArrowPath className="size-4 text-foreground/42 group-hover:text-foreground/78" />
              <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground/88">
                Refresh
              </span>
            </Button>
          </li>
        </ul>
      </div>
      <div className="border-t border-border py-2" />
      <AgentThreadList apiService={apiService} onNavigate={onNavigate} />
    </div>
  );
}
