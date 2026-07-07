'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { Kbd } from '@genfeedai/ui';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
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
  const { orgHref } = useOrgUrl();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
        <div className="group/collapsible flex w-full items-center p-1 text-foreground/30">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
            Conversations
          </span>
          {conversationActions ? (
            <div className="ml-auto">{conversationActions}</div>
          ) : null}
        </div>

        <div className="pb-1 pt-1">
          <Button
            asChild
            className="group flex h-8 w-full cursor-pointer items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/72 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Link href={orgHref(APP_ROUTES.AGENT.NEW)}>
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
          </Button>
        </div>

        <div className="min-h-0 flex-1">{renderConversations()}</div>
      </div>
    </div>
  );
}
