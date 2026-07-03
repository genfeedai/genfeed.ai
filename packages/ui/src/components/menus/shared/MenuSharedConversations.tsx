'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Kbd } from '@genfeedai/ui';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';
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
  const prefetchNewAgentThreadHref = useNavigationPrefetch(newAgentThreadHref);

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
            onFocus={prefetchNewAgentThreadHref}
            onMouseEnter={prefetchNewAgentThreadHref}
            className="group flex h-8 w-full items-center gap-3 rounded px-3 py-1.5 text-left text-foreground/72 transition-colors duration-150 cursor-pointer hover:bg-foreground/[0.035] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
        </div>
        <div className={cn(!isConversationsCollapsed && 'min-h-0 flex-1')}>
          {afterNavigationContent}
        </div>
      </CollapsibleGroup>
    </div>
  );
}
