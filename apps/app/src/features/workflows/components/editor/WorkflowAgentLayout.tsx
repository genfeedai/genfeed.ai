'use client';

import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface WorkflowAgentLayoutProps {
  children: ReactNode;
}

/**
 * The workflow editor's place in the shared agent + output layout. The agent
 * sits in a collapsed rail beside the canvas and expands to half the page on
 * request, or hides to give the canvas the full page; the canvas, its
 * inspector and the run panel stay in the output pane. Both pages wrap their editor here, so the layout has one owner.
 */
export function WorkflowAgentLayout({ children }: WorkflowAgentLayoutProps) {
  const translate = useTranslations('pages.workflows.agentLayout');

  return (
    <AgentOutputShell
      isOutputExpandable
      mode="rail"
      outputLabel={translate('canvas')}
    >
      {children}
    </AgentOutputShell>
  );
}
