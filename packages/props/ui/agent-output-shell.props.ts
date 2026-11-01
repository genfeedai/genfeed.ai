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
  readonly label: string;
}

/**
 * A third pane beside the output for what the output produces: a preview, a
 * render, the final file. It docks on wide screens only; below that the page
 * keeps its own inline version, so nothing is lost on a laptop or phone.
 */
export interface AgentOutputPreviewDefinition {
  readonly content: ReactNode;
  readonly label: string;
}

export interface AgentOutputLayoutLabels {
  readonly agent: string;
  readonly collapseAgent: string;
  readonly collapseOutput: string;
  readonly expandAgent: string;
  readonly expandOutput: string;
  readonly output: string;
}

export interface AgentOutputLayoutProps {
  /**
   * The view of `tabs` that is showing. The first is the page output. There is
   * no tab strip: the page, the topbar's Context icon or a header control
   * chooses the view.
   */
  readonly activeTabId: string;
  /** The agent pane body: transcript and composer. */
  readonly agent: ReactNode;
  /**
   * Title and thread actions above the agent pane body. Leave out for a bare
   * conversation with no header above it.
   */
  readonly agentHeader?: ReactNode;
  readonly className?: string;
  /** Page-specific actions in a slim bar above the output pane. */
  readonly headerActions?: ReactNode;
  /**
   * Adds a button that hides the agent so the output fills the page, and
   * brings it back. The agent stays mounted, so a draft or stream survives.
   */
  readonly isOutputExpandable?: boolean;
  readonly labels: AgentOutputLayoutLabels;
  readonly mode?: AgentOutputLayoutMode;
  /** Docked third pane, shown from the `2xl` breakpoint. */
  readonly preview?: AgentOutputPreviewDefinition;
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
  /** Context is showing in the output pane, opened from the topbar's icon. */
  readonly isContextOpen: boolean;
  /** Back to the page's own view, for example when a thread chip is opened. */
  readonly onCloseContext: () => void;
  /** Brings Context forward, for a record the operator just picked. */
  readonly onOpenContext: () => void;
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
  readonly headerActions?: ReactNode;
  /** Lets the operator hide the agent to see the output full size. */
  readonly isOutputExpandable?: boolean;
  readonly mode?: AgentOutputLayoutMode;
  /** Tab label for the page output. Defaults to "Output". */
  readonly outputLabel?: string;
  /** Docked third pane for the output's preview or final result. */
  readonly preview?: AgentOutputPreviewDefinition;
}
