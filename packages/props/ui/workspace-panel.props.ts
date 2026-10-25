import type {
  ContextSidebarContextValue,
  ContextSidebarOutletProps,
} from './context-sidebar.props';

export type WorkspacePanelTab = 'agent' | 'details' | 'history';

export interface WorkspacePanelTabsProps {
  readonly activeTab: WorkspacePanelTab;
  readonly hasAgent: boolean;
  readonly onClose: () => void;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  readonly onSelectTab: (tab: WorkspacePanelTab) => void;
}

export interface WorkspaceAgentContextProps {
  readonly contextSidebar?: ContextSidebarContextValue | null;
  readonly pageLabel: string;
  readonly referenceCount: number;
  readonly scopeLabel: string;
  readonly target?: ContextSidebarOutletProps['target'];
}
