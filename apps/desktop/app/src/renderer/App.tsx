import type {
  IDesktopBootstrap,
  IDesktopSession,
  IDesktopTrendHandoff,
} from '@genfeedai/desktop-contracts';
import {
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { AuthScreen } from './auth/AuthScreen';
import OnboardingWizard from './components/OnboardingWizard';
import ReconnectBanner from './components/ReconnectBanner';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { useThreads } from './hooks/useThreads';
import type { NavView } from './nav-view';
import OfflineShell from './offline/OfflineShell';
import { useSyncEngine } from './sync/useSyncEngine';
import { initializeRendererTelemetry } from './telemetry';

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

const emptyBootstrap: IDesktopBootstrap = {
  clerkId: null,
  environment: {
    apiEndpoint: '',
    appEndpoint: '',
    appName: 'desktop',
    appPort: 3230,
    authEndpoint: '',
    cdnUrl: '',
    wsEndpoint: '',
  },
  isOfflineMode: false,
  localOrganization: {
    id: 'local-org',
    name: 'Local Workspace',
    slug: 'local-workspace',
  },
  localUser: {
    id: 'local-user',
    name: 'Local Desktop User',
    organizationId: 'local-org',
  },
  localUserId: '',
  preferences: { nativeNotificationsEnabled: false },
  activeWorkspaceId: null,
  brands: [],
  recents: [],
  session: null,
  syncState: {
    failedCount: 0,
    pendingCount: 0,
    retryingCount: 0,
    runningCount: 0,
  },
  workspaces: [],
};

interface OnboardingState {
  completed: boolean;
  loaded: boolean;
}

export const App = () => {
  const [bootstrap, setBootstrap] = useState<IDesktopBootstrap>(emptyBootstrap);
  const [activeView, setActiveView] = useState<NavView>('conversation');
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [pendingTrend, setPendingTrend] = useState<IDesktopTrendHandoff | null>(
    null,
  );
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    completed: false,
    loaded: false,
  });
  const [isDismissedReconnect, setIsDismissedReconnect] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleToggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const localUserId = bootstrap.localUserId || null;
  const selectedWorkspace =
    bootstrap.workspaces.find(
      (workspace) => workspace.id === bootstrap.activeWorkspaceId,
    ) ??
    bootstrap.workspaces[0] ??
    null;
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;

  const {
    activeThreadId,
    activeThread,
    addMessage,
    createThread,
    setActiveThreadId,
    setThreadStatus,
    threads,
  } = useThreads(selectedWorkspaceId, localUserId);

  const {
    errors: syncErrors,
    isSyncing,
    lastSyncAt,
    triggerSync,
  } = useSyncEngine({
    apiEndpoint: bootstrap.environment.apiEndpoint,
    localUserId,
    session: bootstrap.session,
  });

  /* ─── Bootstrap ─── */

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await window.genfeedDesktop.app.getBootstrap();
      setBootstrap(data);
    } catch (err) {
      console.error('Failed to load bootstrap:', err);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      const onboardingStatePromise = window.genfeedDesktop.onboarding
        .getState()
        .catch(() => ({ completed: true }));

      const [, onboardingData] = await Promise.all([
        loadBootstrap(),
        onboardingStatePromise,
      ]);

      setOnboardingState({
        completed: onboardingData.completed,
        loaded: true,
      });
    };

    void run();

    const disposeSession = window.genfeedDesktop.auth.onDidChangeSession(
      (session: IDesktopSession | null) => {
        startTransition(() => {
          setBootstrap((prev) => ({ ...prev, session }));
        });
      },
    );

    const disposeBootstrap = window.genfeedDesktop.app.onDidBootstrapChange(
      (next: IDesktopBootstrap) => {
        startTransition(() => {
          setBootstrap(next);
        });
      },
    );

    const disposeSidebar = window.genfeedDesktop.app.onToggleSidebar(() => {
      setIsSidebarCollapsed((prev) => !prev);
    });

    const disposeQuickGenerate = window.genfeedDesktop.onQuickGenerate(() => {
      setActiveView('conversation');
      createThread();
    });

    return () => {
      disposeBootstrap();
      disposeQuickGenerate();
      disposeSession();
      disposeSidebar();
    };
  }, [loadBootstrap, createThread]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    initializeRendererTelemetry(bootstrap.environment, bootstrap.session);
  }, [bootstrap.environment, bootstrap.session]);

  /* ─── Onboarding ─── */

  const handleOnboardingComplete = useCallback(async () => {
    await window.genfeedDesktop.onboarding.setCompleted();
    setOnboardingState({ completed: true, loaded: true });
  }, []);

  /* ─── Auth ─── */

  const handleLogout = useCallback(async () => {
    await window.genfeedDesktop.auth.logout();
  }, []);

  const handleReconnect = useCallback(async () => {
    await window.genfeedDesktop.auth.login();
  }, []);

  /* ─── Navigation ─── */

  const handleNavigate = useCallback((view: NavView) => {
    setActiveView(view);
  }, []);

  const handleOpenWorkspace = useCallback(async () => {
    await window.genfeedDesktop.workspace.openWorkspace();
  }, []);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    await window.genfeedDesktop.workspace.selectWorkspace(workspaceId);
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveView('conversation');
      setActiveThreadId(threadId);
    },
    [setActiveThreadId],
  );

  const handleNewThread = useCallback(() => {
    setActiveView('conversation');
    createThread();
  }, [createThread]);

  const handleOpenTerminal = useCallback(() => {
    setActiveView('terminal');
  }, []);

  const handleOpenSettings = useCallback(() => {
    // TODO: add settings view
  }, []);

  const handleGenerateFromTrend = useCallback(
    (trend: IDesktopTrendHandoff) => {
      setActiveView('conversation');
      setPendingTrend(trend);
      const thread = createThread();
      const message = {
        content: `Draft a ${trend.platform} brief from trend: ${trend.topic}`,
        createdAt: new Date().toISOString(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user' as const,
      };
      addMessage(thread.id, message);
    },
    [createThread, addMessage],
  );

  /* ─── Derived state ─── */

  const shouldShowWizard =
    onboardingState.loaded &&
    !onboardingState.completed &&
    !bootstrap.clerkId &&
    bootstrap.session !== null;

  const shouldShowReconnect =
    !isDismissedReconnect &&
    bootstrap.clerkId !== null &&
    bootstrap.session === null;

  /* ─── Render ─── */

  // Loading state — wait for onboarding IPC
  if (!onboardingState.loaded) {
    return <div className="desktop-loading" />;
  }

  // Wizard — first time user, never connected
  if (shouldShowWizard) {
    return (
      <OnboardingWizard onComplete={() => void handleOnboardingComplete()} />
    );
  }

  if (bootstrap.session === null && bootstrap.isOfflineMode) {
    return <OfflineShell bootstrap={bootstrap} />;
  }

  if (bootstrap.session === null) {
    return <AuthScreen />;
  }

  const renderMainView = () => {
    switch (activeView) {
      case 'conversation':
        return (
          <ConversationView
            onCreateThread={createThread}
            onSendMessage={addMessage}
            onSetStatus={setThreadStatus}
            onTrendConsumed={() => setPendingTrend(null)}
            pendingTrend={pendingTrend}
            thread={activeThread}
            workspaceId={selectedWorkspaceId}
          />
        );
      case 'terminal':
        return <TerminalView workspaceId={selectedWorkspaceId} />;
      case 'workflows':
        return <WorkflowsView />;
      case 'agents':
        return <AgentsView />;
      case 'mission-control':
        return <MissionControlView onStartNewThread={handleNewThread} />;
      case 'analytics':
        return <AnalyticsView workspaceId={selectedWorkspaceId} />;
      case 'library':
        return (
          <LibraryView
            workspace={selectedWorkspace}
            workspaceId={selectedWorkspaceId}
          />
        );
      case 'trends':
        return <TrendsView onGenerateFromTrend={handleGenerateFromTrend} />;
      default:
        return (
          <ConversationView
            onCreateThread={createThread}
            onSendMessage={addMessage}
            onSetStatus={setThreadStatus}
            onTrendConsumed={() => setPendingTrend(null)}
            pendingTrend={pendingTrend}
            thread={activeThread}
            workspaceId={selectedWorkspaceId}
          />
        );
    }
  };

  return (
    <div className="desktop-layout two-pane">
      {!isOnline && (
        <div className="global-banner global-banner-warning">
          You are offline. Existing drafts stay available, but cloud actions may
          fail until your connection returns.
        </div>
      )}
      {shouldShowReconnect && (
        <ReconnectBanner
          onDismiss={() => setIsDismissedReconnect(true)}
          onReconnect={() => void handleReconnect()}
        />
      )}
      <Sidebar
        activeThreadId={activeThreadId}
        activeWorkspaceId={selectedWorkspaceId}
        activeView={activeView}
        isCollapsed={isSidebarCollapsed}
        isSyncing={isSyncing}
        lastSyncAt={lastSyncAt}
        onLogout={() => void handleLogout()}
        onNavigate={handleNavigate}
        onNewThread={handleNewThread}
        onOpenWorkspace={() => void handleOpenWorkspace()}
        onSelectThread={handleSelectThread}
        onSelectWorkspace={(workspaceId) =>
          void handleSelectWorkspace(workspaceId)
        }
        onTriggerSync={triggerSync}
        session={bootstrap.session}
        syncErrors={syncErrors}
        syncState={bootstrap.syncState}
        threads={threads}
        workspaces={bootstrap.workspaces}
      />
      <div className="main-column">
        <Topbar
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebarCollapse}
          onOpenSettings={handleOpenSettings}
          onOpenTerminal={handleOpenTerminal}
        />
        <main className="main-area">
          <Suspense fallback={<div className="desktop-loading" />}>
            {renderMainView()}
          </Suspense>
        </main>
      </div>
    </div>
  );
};
