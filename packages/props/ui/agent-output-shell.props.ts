import type { ReactNode } from 'react';

/**
 * `split` gives the agent and the output half the page each. `rail` keeps the
 * agent a narrow rail beside a wide tool surface (a timeline, a calendar, a
 * workflow graph) until the operator expands it to a split.
 */
export type AgentOutputLayoutMode = 'rail' | 'split';

export interface AgentOutputTabDefinition {
  readonly content: ReactNode;
  readonly id: string;
  /**
   * Keeps the panel mounted and selectable by `activeTabId` without a button
   * in the strip, for a view something else (the topbar) opens.
   */
  readonly isHiddenFromStrip?: boolean;
  readonly label: string;
}

export interface AgentOutputLayoutLabels {
  readonly agent: string;
  readonly collapseAgent: string;
  readonly collapseOutput: string;
  readonly expandAgent: string;
  readonly expandOutput: string;
  readonly output: string;
  readonly views: string;
}

export interface AgentOutputLayoutProps {
  /** The tab of `tabs` that is showing. The first tab is the page output. */
  readonly activeTabId: string;
  /** The agent pane body: transcript and composer. */
  readonly agent: ReactNode;
  /** Title and thread actions above the agent pane body. */
  readonly agentHeader?: ReactNode;
  readonly className?: string;
  /** Page-specific actions on the right of the output pane's tab strip. */
  readonly headerActions?: ReactNode;
  /**
   * Adds a button that hides the agent so the output fills the page, and
   * brings it back. The agent stays mounted, so a draft or stream survives.
   */
  readonly isOutputExpandable?: boolean;
  readonly labels: AgentOutputLayoutLabels;
  readonly mode?: AgentOutputLayoutMode;
  readonly onTabChange: (tabId: string) => void;
  readonly tabs: readonly AgentOutputTabDefinition[];
}

/**
 * What the workspace shell hands a page that renders `AgentOutputShell`: the
 * master conversation and the shell-owned tabs. Published only on routes the
 * shell has opted out of the dock for.
 */
export interface AgentOutputHostValue {
  /** The conversation, shown when the page does not bring its own agent. */
  readonly agent: ReactNode;
  readonly agentTitle?: string;
  readonly contextPanel: ReactNode;
  readonly onNewThread: () => void;
  readonly onOpenFullPage: () => void;
  /**
   * A page that has no Context tab calls this while mounted so the topbar's
   * context toggle shows and opens the page's selection in the output pane.
   * Returns the unregister.
   */
  readonly registerContextToggle: () => () => void;
  readonly threadsPanel: ReactNode;
}

export interface AgentOutputShellProps {
  /**
   * The page's own agent pane. Leave out for the shell's conversation; a page
   * whose agent is not the master thread yet (a run's own change requests)
   * supplies it here.
   */
  readonly agent?: ReactNode;
  readonly agentTitle?: string;
  /** The page output. */
  readonly children: ReactNode;
  /**
   * Drops the Context tab from the strip: the topbar's context toggle is then
   * the only way to the page's selection, which replaces the output while it
   * is open. Defaults to true.
   */
  readonly hasContextTab?: boolean;
  readonly headerActions?: ReactNode;
  /** Lets the operator hide the agent to see the output full size. */
  readonly isOutputExpandable?: boolean;
  readonly mode?: AgentOutputLayoutMode;
  /** Tab label for the page output. Defaults to "Output". */
  readonly outputLabel?: string;
}
