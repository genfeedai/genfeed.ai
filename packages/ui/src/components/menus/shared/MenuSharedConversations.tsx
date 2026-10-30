'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useIsDesktopClient } from '@genfeedai/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { Kbd } from '@genfeedai/ui';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import CollapsibleGroup from './CollapsibleGroup';

interface MenuSharedConversationsProps {
  afterNavigationContent: ReactNode;
  conversationActions?: ReactNode;
  isConversationsCollapsed: boolean;
  newAgentThreadHref: string;
  onCollapsedChange: (collapsed: boolean) => void;
}

export default function MenuSharedConversations({
  afterNavigationContent,
  conversationActions,
  isConversationsCollapsed,
  newAgentThreadHref,
  onCollapsedChange,
}: MenuSharedConversationsProps) {
  const isDesktop = useIsDesktopClient();

  return (
    <div
      data-testid="sidebar-conversations-section"
      className={cn(
        'px-3 pb-2 pt-2',
        !isConversationsCollapsed && 'flex min-h-0 flex-1 flex-col',
      )}
    >
      <CollapsibleGroup
        label="Conversations"
        isDrillDown={false}
        isCollapsible
        storageKey="__conversations__"
        actions={conversationActions}
        className={cn(
          'mt-0',
          !isConversationsCollapsed && 'flex min-h-0 flex-1 flex-col',
        )}
        contentClassName={cn(
          !isConversationsCollapsed && 'flex min-h-0 flex-1 flex-col',
        )}
        onCollapsedChange={onCollapsedChange}
      >
        <div className="pb-1">
          <Link
            href={newAgentThreadHref}
            className="group flex h-8 w-full items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/80 transition-colors duration-150 cursor-pointer hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Plus className="size-4 text-muted-foreground group-hover:text-foreground/80" />
            <span className="text-sm font-medium tracking-[-0.01em] text-foreground/90">
              New Thread
            </span>
            {isDesktop ? (
              <Kbd
                variant="ghost"
                className={cn(
                  'ml-auto rounded-md border border-border bg-foreground/5 text-2xs text-muted-foreground transition-opacity duration-200',
                  hoverRevealClassName({ isInteractive: false }),
                )}
              >
                ⌘⇧N
              </Kbd>
            ) : null}
          </Link>
        </div>
        <div className={cn(!isConversationsCollapsed && 'min-h-0 flex-1')}>
          {afterNavigationContent}
        </div>
      </CollapsibleGroup>
    </div>
  );
}
