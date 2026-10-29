'use client';

import { useAgentOutputHost } from '@genfeedai/contexts/ui/agent-output-host-context';
import { useContextSidebar } from '@genfeedai/contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AgentOutputShellProps,
  AgentOutputTabDefinition,
} from '@genfeedai/props/ui/agent-output-shell.props';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { Button } from '@ui/primitives/button';
import { Expand, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const OUTPUT_TAB_ID = 'output';
const THREADS_TAB_ID = 'threads';
const CONTEXT_TAB_ID = 'context';

/**
 * The page-facing half of the shared agent + output layout. A page wraps its
 * output in this and gets the agent on the left (the shell's conversation, or
 * its own agent) and the output on the right with Threads and Context tabs.
 *
 * Only routes the workspace shell has opted out of the dock for publish the
 * host; anywhere else this renders the output alone, so a page never shows two
 * agents.
 *
 * Detail the page used to push into the global right panel (`ContextSidebarPanel`)
 * opens in the Context tab here, inside the output pane, so the page stays two
 * columns instead of three.
 */
export default function AgentOutputShell({
  agent,
  agentTitle,
  children,
  headerActions,
  mode,
  outputLabel,
}: AgentOutputShellProps) {
  const host = useAgentOutputHost();
  const contextSidebar = useContextSidebar();
  const translate = useTranslations('common.agentOutput');
  const [activeTabId, setActiveTabId] = useState(OUTPUT_TAB_ID);

  const selection = contextSidebar?.selection ?? null;
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  // Only a record the operator picked takes the pane; one the page selected
  // on its own stays a tab away so the output stays where it was.
  const isUserSelectionOpen =
    selection?.origin === 'user' &&
    (Boolean(contextSidebar?.isOpen) || Boolean(contextSidebar?.isMobileOpen));
  // A new selection brings its detail forward; the operator can still step
  // back to the output while it stays selected.
  useEffect(() => {
    if (selectionKey && isUserSelectionOpen) {
      setActiveTabId(CONTEXT_TAB_ID);
    }
  }, [isUserSelectionOpen, selectionKey]);

  if (!host) {
    return <>{children}</>;
  }

  const hasOwnAgent = agent !== undefined;
  const resolvedTitle = agentTitle ?? host.agentTitle ?? translate('agent');
  const tabs: AgentOutputTabDefinition[] = [
    {
      content: children,
      id: OUTPUT_TAB_ID,
      label: outputLabel ?? translate('output'),
    },
    ...(hasOwnAgent
      ? []
      : [
          {
            content: host.threadsPanel,
            id: THREADS_TAB_ID,
            label: translate('threads'),
          },
        ]),
    {
      content: host.contextPanel,
      id: CONTEXT_TAB_ID,
      label: translate('context'),
    },
  ];

  return (
    <AgentOutputLayout
      activeTabId={activeTabId}
      agent={hasOwnAgent ? agent : host.agent}
      agentHeader={
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {resolvedTitle}
          </span>
          {hasOwnAgent ? null : (
            <>
              <Button
                ariaLabel={translate('newThread')}
                data-testid="agent-output-new-thread"
                icon={<SquarePen className="size-4" />}
                onClick={() => {
                  host.onNewThread();
                  setActiveTabId(OUTPUT_TAB_ID);
                }}
                size={ButtonSize.SM}
                tooltip={translate('newThread')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              <Button
                ariaLabel={translate('openFullPage')}
                data-testid="agent-output-full-page"
                icon={<Expand className="size-4" />}
                onClick={host.onOpenFullPage}
                size={ButtonSize.SM}
                tooltip={translate('openFullPage')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </>
          )}
        </>
      }
      headerActions={headerActions}
      labels={{
        agent: translate('agent'),
        collapseAgent: translate('collapseAgent'),
        expandAgent: translate('expandAgent'),
        output: translate('output'),
        views: translate('views'),
      }}
      mode={mode}
      onTabChange={setActiveTabId}
      tabs={tabs}
    />
  );
}
