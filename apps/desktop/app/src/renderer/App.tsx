import type {
  IDesktopBootstrap,
  IDesktopSession,
  IDesktopTrendHandoff,
} from '@genfeedai/desktop-contracts';
import { startTransition, useCallback, useEffect, useReducer } from 'react';
import { AuthScreen } from './auth/AuthScreen';
import OnboardingWizard from './components/OnboardingWizard';
import ReconnectBanner from './components/ReconnectBanner';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { useThreads } from './hooks/useThreads';
import MainView from './MainView';
import type { NavView } from './nav-view';
import OfflineShell from './offline/OfflineShell';
import { useSyncEngine } from './sync/useSyncEngine';
import { initializeRendererTelemetry } from './telemetry';
import type { DesktopAgentRunHandoff } from './views/AgentsView';

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

interface AppState {
  bootstrap: IDesktopBootstrap;
  activeView: NavView;
  isOnline: boolean;
  pendingTrend: IDesktopTrendHandoff | null;
  onboardingCompleted: boolean;
  onboardingLoaded: boolean;
  isDismissedReconnect: boolean;
  isSidebarCollapsed: boolean;
}

type AppAction =
  | { type: 'SET_BOOTSTRAP'; payload: IDesktopBootstrap }
  | { type: 'SET_SESSION'; payload: IDesktopSession | null }
  | { type: 'SET_ACTIVE_VIEW'; payload: NavView }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_PENDING_TREND'; payload: IDesktopTrendHandoff | null }
  | { type: 'SET_ONBOARDING'; payload: { completed: boolean; loaded: boolean } }
  | { type: 'DISMISS_RECONNECT' }
  | { type: 'TOGGLE_SIDEBAR' };

const initialState: AppState = {
  bootstrap: emptyBootstrap,
  activeView: 'conversation',
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingTrend: null,
  onboardingCompleted: false,
  onboardingLoaded: false,
  isDismissedReconnect: false,
  isSidebarCollapsed: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_BOOTSTRAP':
      return { ...state, bootstrap: action.payload };
    case 'SET_SESSION':
      return {
        ...state,
        bootstrap: { ...state.bootstrap, session: action.payload },
      };
    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.payload };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'SET_PENDING_TREND':
      return { ...state, pendingTrend: action.payload };
    case 'SET_ONBOARDING':
      return {
        ...state,
        onboardingCompleted: action.payload.completed,
        onboardingLoaded: action.payload.loaded,
      };
    case 'DISMISS_RECONNECT':
      return { ...state, isDismissedReconnect: true };
    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarCollapsed: !state.isSidebarCollapsed };
    default:
      return state;
  }
}

export const App = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const {
    bootstrap,
    activeView,
    isOnline,
    pendingTrend,
    onboardingCompleted,
    onboardingLoaded,
    isDismissedReconnect,
    isSidebarCollapsed,
  } = state;

  const handleToggleSidebarCollapse = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
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
      dispatch({ type: 'SET_BOOTSTRAP', payload: data });
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

      dispatch({
        type: 'SET_ONBOARDING',
        payload: { completed: onboardingData.completed, loaded: true },
      });
    };

    void run();

    const disposeSession = window.genfeedDesktop.auth.onDidChangeSession(
      (session: IDesktopSession | null) => {
        startTransition(() => {
          dispatch({ type: 'SET_SESSION', payload: session });
        });
      },
    );

    const disposeBootstrap = window.genfeedDesktop.app.onDidBootstrapChange(
      (next: IDesktopBootstrap) => {
        startTransition(() => {
          dispatch({ type: 'SET_BOOTSTRAP', payload: next });
        });
      },
    );

    const disposeSidebar = window.genfeedDesktop.app.onToggleSidebar(() => {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    });

    const disposeQuickGenerate = window.genfeedDesktop.onQuickGenerate(() => {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'conversation' });
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
    const handleOnline = () => dispatch({ type: 'SET_ONLINE', payload: true });
    const handleOffline = () =>
      dispatch({ type: 'SET_ONLINE', payload: false });

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
    dispatch({
      type: 'SET_ONBOARDING',
      payload: { completed: true, loaded: true },
    });
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
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: view });
  }, []);

  const handleOpenWorkspace = useCallback(async () => {
    await window.genfeedDesktop.workspace.openWorkspace();
  }, []);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    await window.genfeedDesktop.workspace.selectWorkspace(workspaceId);
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'conversation' });
      setActiveThreadId(threadId);
    },
    [setActiveThreadId],
  );

  const handleNewThread = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'conversation' });
    createThread();
  }, [createThread]);

  const handleOpenTerminal = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'terminal' });
  }, []);

  const handleOpenSettings = useCallback(() => {
    // TODO: add settings view
  }, []);

  const handleGenerateFromTrend = useCallback(
    (trend: IDesktopTrendHandoff) => {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'conversation' });
      dispatch({ type: 'SET_PENDING_TREND', payload: trend });
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

  const handleAgentRunHandoff = useCallback(
    ({ agentName, run }: DesktopAgentRunHandoff) => {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'conversation' });
      const thread = createThread();
      const outputParts = [
        run.outputSummary,
        run.contentGenerated !== undefined
          ? `${String(run.contentGenerated)} generated output${
              run.contentGenerated === 1 ? '' : 's'
            }`
          : undefined,
        run.creditsUsed !== undefined
          ? `${String(run.creditsUsed)} credits used`
          : undefined,
        run.threadId ? `Cloud thread: ${run.threadId}` : undefined,
      ].filter((part): part is string => Boolean(part));
      const content =
        outputParts.length > 0
          ? `Review and turn this ${agentName} run into a content-ready follow-up:\n\n${outputParts.join('\n')}`
          : `Review the latest ${agentName} run and prepare the next content handoff.`;

      addMessage(thread.id, {
        content,
        createdAt: new Date().toISOString(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
      });
    },
    [addMessage, createThread],
  );

  const handleTrendConsumed = useCallback(() => {
    dispatch({ type: 'SET_PENDING_TREND', payload: null });
  }, []);

  /* ─── Derived state ─── */

  const shouldShowWizard =
    onboardingLoaded &&
    !onboardingCompleted &&
    !bootstrap.clerkId &&
    bootstrap.session !== null;

  const shouldShowReconnect =
    !isDismissedReconnect &&
    bootstrap.clerkId !== null &&
    bootstrap.session === null;

  /* ─── Render ─── */

  // Loading state — wait for onboarding IPC
  if (!onboardingLoaded) {
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
          onDismiss={() => dispatch({ type: 'DISMISS_RECONNECT' })}
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
          <MainView
            activeView={activeView}
            activeThread={activeThread}
            isOnline={isOnline}
            pendingTrend={pendingTrend}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            onCreateThread={createThread}
            onSendMessage={addMessage}
            onSetStatus={setThreadStatus}
            onTrendConsumed={handleTrendConsumed}
            onNewThread={handleNewThread}
            onRunHandoff={handleAgentRunHandoff}
            onGenerateFromTrend={handleGenerateFromTrend}
          />
        </main>
      </div>
    </div>
  );
};
