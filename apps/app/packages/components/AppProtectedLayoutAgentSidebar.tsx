'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';

type Props = {
  conversationActions: ReactNode;
  renderConversations: (searchAction?: ReactNode) => ReactNode;
};

export default function AgentSidebarContent({
  conversationActions,
  renderConversations,
}: Props) {
  const { orgHref } = useOrgUrl();
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col pb-2 pt-2">
        <div className="group/collapsible flex w-full items-center px-3 py-1 text-foreground/30">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
            Conversations
          </span>
          {conversationActions ? (
            <div className="ml-auto">{conversationActions}</div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {renderConversations(newThreadAction)}
        </div>
      </div>
    </div>
  );
}
