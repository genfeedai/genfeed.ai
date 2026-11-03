'use client';

import type {
  CreativeAppWorkspaceProps,
  CreativeProjectsPresence,
} from '@genfeedai/props/ui/layout/creative-app-layout.props';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import {
  createContext,
  type ReactElement,
  useContext,
  useEffect,
  useState,
} from 'react';

const CreativeProjectsPresenceContext = createContext<
  ((presence: CreativeProjectsPresence) => void) | null
>(null);

/**
 * Called by a creative app's projects list with what it knows: `empty` once it
 * has loaded and the brand has no project at all (not merely none matching a
 * search), `populated` once it has any. Keep `unknown` while loading, on an
 * error and while a search is narrowing the list, so the layout never moves
 * for a search.
 */
export function useCreativeProjectsPresence(
  presence: CreativeProjectsPresence,
): void {
  const report = useContext(CreativeProjectsPresenceContext);
  useEffect(() => {
    if (presence !== 'unknown') report?.(presence);
  }, [presence, report]);
}

/**
 * Turbo, Clipper, Motion, Editor and Storyboard with no project open: the New
 * pane on the left and the brand's projects on the right. While the brand has
 * no project at all there is nothing to put on the right, so the New pane has
 * the page to itself; the second column arrives with the first project. The
 * list stays mounted either way, so it is the one that notices.
 */
export default function CreativeAppWorkspace({
  agent,
  agentTitle,
  children,
  outputLabel,
}: CreativeAppWorkspaceProps): ReactElement {
  const [presence, setPresence] = useState<CreativeProjectsPresence>('unknown');
  return (
    <CreativeProjectsPresenceContext.Provider value={setPresence}>
      <AgentOutputShell
        agent={agent}
        agentTitle={agentTitle}
        isOutputHidden={presence === 'empty'}
        outputLabel={outputLabel}
      >
        {children}
      </AgentOutputShell>
    </CreativeProjectsPresenceContext.Provider>
  );
}
