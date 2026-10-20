import type { AgentDockThreadMenuProps } from './agent-dock.props';

export type WorkspacePanelTab = 'agent' | 'details';

export interface WorkspacePanelTabsProps {
  readonly activeTab: WorkspacePanelTab;
  /** The shell can host the agent on this route. */
  readonly hasAgent: boolean;
  /** A page has a selection to show in the Details tab. */
  readonly hasDetails: boolean;
  readonly onClose: () => void;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  readonly onSelectTab: (tab: WorkspacePanelTab) => void;
  readonly threadMenu: AgentDockThreadMenuProps;
}
