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
import { Expand, History, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const OUTPUT_TAB_ID = 'output';
const THREADS_TAB_ID = 'threads';
const CONTEXT_TAB_ID = 'context';

/**
 * The page-facing half of the shared agent + output layout. A page wraps its
 * output in this and gets the agent on the left (the shell's conversation, or
 * its own agent) and the output on the right. There is no tab strip: Context
 * opens from the topbar's icon, and Threads from the History button in the
 * agent header.
 *
 * Only routes the workspace shell has opted out of the dock for publish the
 * host; anywhere else this renders the output alone, so a page never shows two
 * agents.
 *
 * Detail the page used to push into the global right panel (`ContextSidebarPanel`)
 * opens as Context here, inside the output pane, so the page stays two columns
 * instead of three.
 */
export default function AgentOutputShell({
  agent,
  agentTitle,
  children,
  headerActions,
  isOutputExpandable,
  outputLabel,
  preview,
}: AgentOutputShellProps) {
  const host = useAgentOutputHost();
  const contextSidebar = useContextSidebar();
  const translate = useTranslations('common.agentOutput');
  const [isThreadsOpen, setIsThreadsOpen] = useState(false);

  const selection = contextSidebar?.selection ?? null;
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  // Only a record the operator picked takes the pane; one the page selected
  // on its own stays out of the way so the output stays where it was.
  const isUserSelection = selection?.origin === 'user';
  const isUserSelectionOpen =
    isUserSelection &&
    (Boolean(contextSidebar?.isOpen) || Boolean(contextSidebar?.isMobileOpen));
  // A selection already registered when the shell mounts belongs to the page
  // the operator just left (the sidebar state outlives a route change), so it
  // must not pull this page onto an empty Context view.
  const carriedSelectionKeyRef = useRef(selectionKey);
  const onOpenContext = host?.onOpenContext;
  // A new selection brings its detail forward; the operator can still step
  // back to the output with the topbar's Context icon.
  // use-effect-audit: ignore opens the host's Context panel
  useEffect(() => {
    if (!selectionKey) {
      carriedSelectionKeyRef.current = null;
      return;
    }
    if (
      isUserSelectionOpen &&
      selectionKey !== carriedSelectionKeyRef.current
    ) {
      // Once per selection: the operator steps back to the output with the
      // topbar's Context icon, and the same record must not pull them in again.
      carriedSelectionKeyRef.current = selectionKey;
      onOpenContext?.();
    }
  }, [isUserSelectionOpen, onOpenContext, selectionKey]);

  // The record the operator picked is gone (removed, or cleared): there is
  // nothing left for Context to show, so the output comes back. A record the
  // page selected on its own can come and go without moving the pane.
  const wasUserSelectionRef = useRef(isUserSelection);
  const onCloseContext = host?.onCloseContext;
  // use-effect-audit: ignore closes the host's Context panel
  useEffect(() => {
    if (wasUserSelectionRef.current && !selectionKey) {
      onCloseContext?.();
    }
    wasUserSelectionRef.current = selectionKey ? isUserSelection : false;
  }, [isUserSelection, onCloseContext, selectionKey]);

  // Stepping back to the output from the topbar's Context icon deselects a
  // record the operator picked, as closing the rail does; one the page
  // selected on its own stays selected.
  const isContextOpen = host?.isContextOpen ?? false;
  const wasContextOpenRef = useRef(isContextOpen);
  const closeSelection = contextSidebar?.close;
  // use-effect-audit: ignore deselects the operator's record when Context closes
  useEffect(() => {
    if (wasContextOpenRef.current && !isContextOpen && isUserSelection) {
      closeSelection?.();
    }
    wasContextOpenRef.current = isContextOpen;
  }, [closeSelection, isContextOpen, isUserSelection]);

  if (!host) {
    return <>{children}</>;
  }

  const hasOwnAgent = agent !== undefined;
  const resolvedTitle = agentTitle ?? host.agentTitle ?? translate('agent');
  const activeTabId = host.isContextOpen
    ? CONTEXT_TAB_ID
    : isThreadsOpen && !hasOwnAgent
      ? THREADS_TAB_ID
      : OUTPUT_TAB_ID;
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
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            data-pane-title
          >
            {resolvedTitle}
          </span>
          {hasOwnAgent ? null : (
            <>
              <Button
                ariaLabel={translate('threads')}
                aria-pressed={isThreadsOpen}
                data-testid="agent-output-threads-toggle"
                icon={<History className="size-4" />}
                onClick={() => setIsThreadsOpen((current) => !current)}
                size={ButtonSize.SM}
                tooltip={translate('threads')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              <Button
                ariaLabel={translate('newThread')}
                data-testid="agent-output-new-thread"
                icon={<SquarePen className="size-4" />}
                onClick={() => {
                  host.onNewThread();
                  setIsThreadsOpen(false);
                }}
                size={ButtonSize.SM}
                tooltip={translate('newThread')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              {host.onOpenFullPage ? (
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
              ) : null}
            </>
          )}
        </>
      }
      headerActions={headerActions}
      isOutputExpandable={isOutputExpandable}
      labels={{
        agent: translate('agent'),
        collapseOutput: translate('collapseOutput'),
        expandOutput: translate('expandOutput'),
        output: translate('output'),
        resizePanes: translate('resizePanes'),
      }}
      preview={preview}
      tabs={tabs}
    />
  );
}
