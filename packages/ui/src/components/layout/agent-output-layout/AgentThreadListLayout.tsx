'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AgentThreadListLayoutProps } from '@genfeedai/props/ui/agent-output-shell.props';
import { AGENT_PANE_HEADER_CLASS_NAME } from '@ui/layout/agent-output-layout/agent-pane.constant';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { useState } from 'react';

type MobileView = 'conversation' | 'threads';

/**
 * The full-size arrangement of the agent: the thread list in a narrow column on
 * the left and one conversation taking the rest of the page. It is what the
 * split (the agent beside its output) turns into when the operator expands it.
 * Both panes stay mounted so a draft or a running stream survives a switch;
 * below `xl` an Threads / Conversation switch shows one at a time.
 *
 * Pure layout: the list, the conversation and their labels come in as props.
 */
export default function AgentThreadListLayout({
  conversation,
  conversationHeader,
  conversationKey,
  labels,
  list,
}: AgentThreadListLayoutProps) {
  // The operator's pick holds only for the conversation it was made on.
  const [pick, setPick] = useState<{
    key: string | null;
    view: MobileView;
  } | null>(null);
  const mobileView: MobileView =
    pick && pick.key === conversationKey
      ? pick.view
      : conversationKey
        ? 'conversation'
        : 'threads';

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      data-mobile-view={mobileView}
      data-testid="agent-thread-list-layout"
    >
      <div className="shrink-0 border-b border-border px-3 py-2 xl:hidden">
        <ViewMenu
          activeView={mobileView}
          onChange={(view) => setPick({ key: conversationKey, view })}
          options={[
            { icon: null, label: labels.threads, type: 'threads' },
            { icon: null, label: labels.conversation, type: 'conversation' },
          ]}
          trigger="label"
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
        <section
          aria-label={labels.threads}
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-border xl:border-r',
            mobileView === 'conversation' && 'max-xl:hidden',
          )}
          data-testid="agent-thread-list-pane"
        >
          <header className={AGENT_PANE_HEADER_CLASS_NAME}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {labels.threads}
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{list}</div>
        </section>

        <section
          aria-label={labels.conversation}
          className={cn(
            'flex min-h-0 min-w-0 flex-col',
            mobileView === 'threads' && 'max-xl:hidden',
          )}
          data-testid="agent-thread-list-conversation-pane"
        >
          <header className={AGENT_PANE_HEADER_CLASS_NAME}>
            {conversationHeader}
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{conversation}</div>
        </section>
      </div>
    </div>
  );
}
