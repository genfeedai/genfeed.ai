import type {
  IDesktopBrand,
  IDesktopCloudOrganization,
  IDesktopMessage,
  IDesktopThread,
  IDesktopTrendHandoff,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { lazy, type ReactElement, Suspense } from 'react';
import CloudConnectionNotice from './components/CloudConnectionNotice';
import type { NavView } from './nav-view';
import type { DesktopAgentRunHandoff } from './views/AgentsView';

const AgentsView = lazy(() =>
  import('./views/AgentsView').then((module) => ({
    default: module.AgentsView,
  })),
);
const AnalyticsView = lazy(() =>
  import('./views/AnalyticsView').then((module) => ({
    default: module.AnalyticsView,
  })),
);
const ConversationView = lazy(() =>
  import('./views/ConversationView').then((module) => ({
    default: module.ConversationView,
  })),
);
const LibraryView = lazy(() =>
  import('./views/LibraryView').then((module) => ({
    default: module.LibraryView,
  })),
);
const MissionControlView = lazy(() =>
  import('./views/MissionControlView').then((module) => ({
    default: module.MissionControlView,
  })),
);
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((module) => ({
    default: module.SettingsView,
  })),
);
const TerminalView = lazy(() =>
  import('./views/TerminalView').then((module) => ({
    default: module.TerminalView,
  })),
);
const TrendsView = lazy(() =>
  import('./views/TrendsView').then((module) => ({
    default: module.TrendsView,
  })),
);
const WorkflowsView = lazy(() =>
  import('./views/WorkflowsView').then((module) => ({
    default: module.WorkflowsView,
  })),
);

interface MainViewProps {
  activeView: NavView;
  activeThread: IDesktopThread | null;
  brands: IDesktopBrand[];
  cloudOrganizations: IDesktopCloudOrganization[];
  isOnline: boolean;
  isCloudConnected: boolean;
  pendingTrend: IDesktopTrendHandoff | null;
  selectedWorkspace: IDesktopWorkspace | null;
  selectedWorkspaceId: string | null;
  onCreateThread: () => IDesktopThread;
  onConnectCloud: () => void;
  onSendMessage: (threadId: string, message: IDesktopMessage) => void;
  onSetStatus: (threadId: string, status: 'awaiting-response' | 'idle') => void;
  onTrendConsumed: () => void;
  onNewThread: () => void;
  onRunHandoff: (handoff: DesktopAgentRunHandoff) => void;
  onGenerateFromTrend: (trend: IDesktopTrendHandoff) => void;
}

function MainView({
  activeView,
  activeThread,
  brands,
  cloudOrganizations,
  isOnline,
  isCloudConnected,
  pendingTrend,
  selectedWorkspace,
  selectedWorkspaceId,
  onCreateThread,
  onConnectCloud,
  onSendMessage,
  onSetStatus,
  onTrendConsumed,
  onNewThread,
  onRunHandoff,
  onGenerateFromTrend,
}: MainViewProps) {
  const conversationView = (
    <ConversationView
      onCreateThread={onCreateThread}
      onSendMessage={onSendMessage}
      onSetStatus={onSetStatus}
      onTrendConsumed={onTrendConsumed}
      pendingTrend={pendingTrend}
      brands={brands}
      cloudOrganizations={cloudOrganizations}
      isCloudConnected={isCloudConnected}
      thread={activeThread}
      workspaceId={selectedWorkspaceId}
    />
  );

  let content: ReactElement;
  switch (activeView) {
    case 'conversation':
      content = conversationView;
      break;
    case 'terminal':
      content = <TerminalView workspaceId={selectedWorkspaceId} />;
      break;
    case 'workflows':
      content = (
        <WorkflowsView
          isCloudConnected={isCloudConnected}
          isOnline={isOnline}
          onConnectCloud={onConnectCloud}
        />
      );
      break;
    case 'agents':
      content = (
        <AgentsView
          isCloudConnected={isCloudConnected}
          isOnline={isOnline}
          onConnectCloud={onConnectCloud}
          onRunHandoff={onRunHandoff}
        />
      );
      break;
    case 'mission-control':
      content = <MissionControlView onStartNewThread={onNewThread} />;
      break;
    case 'settings':
      content = <SettingsView />;
      break;
    case 'analytics':
      content = (
        <AnalyticsView
          isCloudConnected={isCloudConnected}
          isOnline={isOnline}
          workspaceId={selectedWorkspaceId}
        />
      );
      break;
    case 'library':
      content = (
        <LibraryView
          isCloudConnected={isCloudConnected}
          isOnline={isOnline}
          workspace={selectedWorkspace}
          workspaceId={selectedWorkspaceId}
        />
      );
      break;
    case 'trends':
      content = (
        <TrendsView
          isCloudConnected={isCloudConnected}
          isOnline={isOnline}
          onGenerateFromTrend={onGenerateFromTrend}
        />
      );
      break;
    default:
      content = conversationView;
  }

  const showsCloudActions = ['agents', 'conversation', 'workflows'].includes(
    activeView,
  );

  return (
    <>
      {!isCloudConnected && showsCloudActions ? (
        <CloudConnectionNotice onConnect={onConnectCloud} />
      ) : null}
      <Suspense fallback={<div className="desktop-loading" />}>
        {content}
      </Suspense>
    </>
  );
}

export default MainView;
