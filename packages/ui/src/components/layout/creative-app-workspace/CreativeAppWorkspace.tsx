'use client';

import type { CreativeAppWorkspaceProps } from '@genfeedai/props/ui/layout/creative-app-layout.props';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import type { ReactElement } from 'react';

/**
 * Turbo, Clipper, Motion, Editor and Storyboard with no project open: the New
 * pane on the left and the brand's projects on the right. Both columns are
 * always there, so a brand with no project yet sees the same two-column page it
 * will have; the right column says what to do first.
 */
export default function CreativeAppWorkspace({
  agent,
  agentTitle,
  children,
  outputLabel,
}: CreativeAppWorkspaceProps): ReactElement {
  return (
    <AgentOutputShell
      agent={agent}
      agentTitle={agentTitle}
      outputLabel={outputLabel}
    >
      {children}
    </AgentOutputShell>
  );
}
