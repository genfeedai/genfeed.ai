'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { Kbd } from '@genfeedai/ui';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SidebarBackRow from '@ui/menus/sidebar-back-row/SidebarBackRow';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';

type Props = {
  conversationActions: ReactNode;
  renderConversations: () => ReactNode;
};

export default function AgentSidebarContent({
  conversationActions,
  renderConversations,
}: Props) {
  const { href, orgHref } = useOrgUrl();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarBackRow
        label="Workspace"
        href={href(APP_ROUTES.WORKSPACE.OVERVIEW)}
      />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
            Conversations
          </span>
          {conversationActions}
        </div>

        <div className="pb-1">
          <Link
            href={orgHref(APP_ROUTES.AGENT.NEW)}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-white/80 transition-colors duration-200 group cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <HiPlus className="size-4 text-white/80 group-hover:text-white" />
            <span className="text-sm font-medium text-white/90">
              New Thread
            </span>
            <Kbd
              variant="ghost"
              className="ml-auto text-[11px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              ⌘⇧N
            </Kbd>
          </Link>
        </div>

        <div className="min-h-0 flex-1">{renderConversations()}</div>
      </div>
    </div>
  );
}
