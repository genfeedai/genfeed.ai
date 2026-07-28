import { AgentThreadList } from '@genfeedai/agent/components/AgentThreadList';
import {
  AGENT_SIDEBAR_TRANSITION_DURATION_MS,
  AGENT_SIDEBAR_TRANSITION_EASING,
} from '@genfeedai/agent/constants/agent-panel.constant';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { HiArrowLeft, HiPlus } from 'react-icons/hi2';

interface AgentSidebarContentProps {
  apiService: AgentApiService;
  onNavigate?: (path: string) => void;
}

export function AgentSidebarContent({
  apiService,
  onNavigate,
}: AgentSidebarContentProps): ReactElement {
  const { href, orgHref } = useOrgUrl();

  const newThreadAction = (
    <Button
      asChild
      ariaLabel="New agent thread"
      className="size-8 shrink-0 rounded-md border border-border bg-foreground/[0.025] text-foreground/48 hover:bg-foreground/[0.07] hover:text-foreground"
      size={ButtonSize.ICON}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <Link href={orgHref(APP_ROUTES.AGENT.NEW)}>
        <HiPlus className="size-4" />
      </Link>
    </Button>
  );

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
      <AgentThreadList
        apiService={apiService}
        onNavigate={onNavigate}
        searchAction={newThreadAction}
      />
    </div>
  );
}
