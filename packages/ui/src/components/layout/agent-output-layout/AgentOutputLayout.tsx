'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AgentOutputLayoutProps } from '@genfeedai/props/ui/agent-output-shell.props';
import { Button } from '@ui/primitives/button';
import { Tabs } from '@ui/primitives/tabs';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';

type MobileView = 'agent' | 'output';

/**
 * The agent on the left and the page output on the right. Both panes stay
 * mounted at every width so a draft or a running stream survives a tab or a
 * mobile switch; below `xl` an Agent / Output switch shows one at a time.
 *
 * Pure layout: the conversation, the tabs' content and their labels all come
 * in as props, so any app and any agent can sit in it.
 */
export default function AgentOutputLayout({
  activeTabId,
  agent,
  agentHeader,
  className,
  headerActions,
  isOutputExpandable = false,
  labels,
  mode = 'split',
  tabs,
}: AgentOutputLayoutProps) {
  const [mobileView, setMobileView] = useState<MobileView>('agent');
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const isRail = mode === 'rail' && !isRailExpanded;
  const isAgentHidden = isOutputExpandable && isOutputExpanded;
  const hasAgentHeader = agentHeader !== undefined || mode === 'rail';
  const hasOutputHeader = Boolean(headerActions) || isOutputExpandable;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background',
        className,
      )}
      data-mode={isRail ? 'rail' : 'split'}
      data-mobile-view={mobileView}
      data-testid="agent-output-layout"
    >
      <div className="shrink-0 border-b border-border px-3 py-2 xl:hidden">
        <Tabs
          activeTab={mobileView}
          ariaLabel={labels.views}
          className="ml-0 justify-start"
          fullWidth={false}
          listClassName="mr-auto"
          onTabChange={(tabId) =>
            setMobileView(tabId === 'output' ? 'output' : 'agent')
          }
          tabs={[
            { id: 'agent', label: labels.agent },
            { id: 'output', label: labels.output },
          ]}
        />
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          isAgentHidden && 'xl:grid-cols-[minmax(0,1fr)]',
          !isAgentHidden &&
            (isRail
              ? 'xl:grid-cols-[22.5rem_minmax(0,1fr)]'
              : 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'),
        )}
      >
        <section
          aria-label={labels.agent}
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-border xl:border-r',
            mobileView === 'output' && 'max-xl:hidden',
            isAgentHidden && 'xl:hidden',
          )}
          data-testid="agent-output-agent-pane"
        >
          {hasAgentHeader ? (
            <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {agentHeader}
              </div>
              {mode === 'rail' ? (
                <Button
                  ariaLabel={
                    isRailExpanded ? labels.collapseAgent : labels.expandAgent
                  }
                  className="max-xl:hidden"
                  data-testid="agent-output-rail-toggle"
                  icon={
                    isRailExpanded ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )
                  }
                  onClick={() => setIsRailExpanded((current) => !current)}
                  size={ButtonSize.SM}
                  tooltip={
                    isRailExpanded ? labels.collapseAgent : labels.expandAgent
                  }
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
            </header>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">{agent}</div>
        </section>

        <section
          aria-label={labels.output}
          className={cn(
            'flex min-h-0 min-w-0 flex-col',
            mobileView === 'agent' && 'max-xl:hidden',
          )}
          data-testid="agent-output-output-pane"
        >
          {hasOutputHeader ? (
            <header className="flex min-h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-4 py-2">
              {headerActions}
              {isOutputExpandable ? (
                <Button
                  ariaLabel={
                    isOutputExpanded
                      ? labels.collapseOutput
                      : labels.expandOutput
                  }
                  className="max-xl:hidden"
                  data-testid="agent-output-expand-output"
                  icon={
                    isOutputExpanded ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )
                  }
                  onClick={() => setIsOutputExpanded((current) => !current)}
                  size={ButtonSize.SM}
                  tooltip={
                    isOutputExpanded
                      ? labels.collapseOutput
                      : labels.expandOutput
                  }
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
            </header>
          ) : null}
          {/* Every tab stays mounted: the page output keeps its scroll and
              unsaved edits while Threads or Context is showing. */}
          {tabs.map((tab) => (
            <div
              aria-label={tab.label}
              className="min-h-0 flex-1 flex-col overflow-y-auto data-[state=active]:flex data-[state=inactive]:hidden"
              data-state={tab.id === activeTabId ? 'active' : 'inactive'}
              hidden={tab.id !== activeTabId}
              key={tab.id}
              role="tabpanel"
            >
              {tab.content}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
