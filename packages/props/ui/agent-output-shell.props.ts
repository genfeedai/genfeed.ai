import type { ReactNode } from 'react';

/**
 * `split` gives the agent and the output half the page each. `rail` keeps the
 * agent a narrow rail beside a wide tool surface (a timeline, a calendar, a
 * workflow graph) until the operator expands it to a split.
 */
export type AgentOutputLayoutMode = 'rail' | 'split';

/** The pane a phone opens on, below `xl` where one pane shows at a time. */
export type AgentOutputMobileView = 'agent' | 'output';

export interface AgentOutputTabDefinition {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: string;
}

export interface AgentOutputLayoutLabels {
  readonly agent: string;
  readonly collapseAgent: string;
  readonly expandAgent: string;
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
  /** Phone only: the pane that shows first. Defaults to the agent. */
  readonly defaultMobileView?: AgentOutputMobileView;
  /** Page-specific actions on the right of the output pane's tab strip. */
  readonly headerActions?: ReactNode;
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
   * Phone only: the pane that shows first. Browse-first pages (a library, a
   * calendar) open on their output; a page led by its agent keeps the default.
   */
  readonly defaultMobileView?: AgentOutputMobileView;
  readonly headerActions?: ReactNode;
  readonly mode?: AgentOutputLayoutMode;
  /** Tab label for the page output. Defaults to "Output". */
  readonly outputLabel?: string;
}
