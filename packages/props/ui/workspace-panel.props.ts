import type { AgentDockThreadMenuProps } from './agent-dock.props';

export type WorkspacePanelTab = 'agent' | 'details';

/** One open chat in the panel's tab strip. */
export interface WorkspacePanelChatTab {
  readonly id: string;
  readonly title: string;
}

export interface WorkspacePanelTabsProps {
  readonly activeTab: WorkspacePanelTab;
  /** The open chat in front when the agent tab group is active. */
  readonly activeChatId: string | null;
  /** Open chats; empty when the shell cannot host the agent on this route. */
  readonly chatTabs: readonly WorkspacePanelChatTab[];
  /** A page has a selection to show in the Details tab. */
  readonly hasDetails: boolean;
  readonly onClose: () => void;
  /** Closes one chat tab; `undefined` while it is the only, unsaved chat. */
  readonly onCloseChat?: (chatId: string) => void;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  readonly onSelectChat: (chatId: string) => void;
  readonly onSelectTab: (tab: WorkspacePanelTab) => void;
  readonly threadMenu: AgentDockThreadMenuProps;
}
