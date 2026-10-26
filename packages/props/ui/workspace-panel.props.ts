import type {
  ContextSidebarContextValue,
  ContextSidebarOutletProps,
} from './context-sidebar.props';

export type WorkspacePanelTab = 'agent' | 'details' | 'history';

/**
 * What the workspace shell hands the topbar so its Chat and Context toggles
 * drive the one side panel. Chat covers the conversation and its History.
 */
export interface WorkspacePanelControls {
  /** The view on screen, or `null` while the panel is closed. */
  readonly activeView: WorkspacePanelTab | null;
  /** Context always has something to show where the agent hosts the panel. */
  readonly canShowContext: boolean;
  readonly close: () => void;
  readonly selectView: (view: WorkspacePanelTab) => void;
}

export interface WorkspacePanelHeaderProps {
  readonly activeView: WorkspacePanelTab;
  readonly hasAgent: boolean;
  readonly onClose: () => void;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  readonly onSelectView: (view: WorkspacePanelTab) => void;
}

export interface WorkspaceAgentContextProps {
  readonly contextSidebar?: ContextSidebarContextValue | null;
  readonly pageLabel: string;
  readonly referenceCount: number;
  readonly scopeLabel: string;
  readonly target?: ContextSidebarOutletProps['target'];
}
