import type {
  IDesktopBootstrap,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { AuthScreen } from './auth/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { useThreads } from './hooks/useThreads';
import type { NavView } from './nav-view';
import { initializeRendererTelemetry } from './telemetry';
import { AgentsView } from './views/AgentsView';
import { AnalyticsView } from './views/AnalyticsView';
import { ConversationView } from './views/ConversationView';
import { LibraryView } from './views/LibraryView';
import { TrendsView } from './views/TrendsView';
import { WorkflowsView } from './views/WorkflowsView';

const emptyBootstrap: IDesktopBootstrap = {
  environment: {
    apiEndpoint: '',
    appEndpoint: '',
    appName: 'desktop',
    authEndpoint: '',
    cdnUrl: '',
    wsEndpoint: '',
  },
  preferences: { nativeNotificationsEnabled: false },
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

export const App = () => {
  const [bootstrap, setBootstrap] = useState<IDesktopBootstrap>(emptyBootstrap);
  const [activeView, setActiveView] = useState<NavView>('conversation');
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [pendingTrend, setPendingTrend] = useState<{
    id: string;
    platform: 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'youtube';
    topic: string;
  } | null>(null);

  const selectedWorkspaceId = bootstrap.workspaces[0]?.id ?? null;

  const {
    activeThread,
    activeThreadId,
    addMessage,
    createThread,
    setActiveThreadId,
    setThreadStatus,
    threads,
  } = useThreads(selectedWorkspaceId);

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
    void loadBootstrap();

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
      // Toggle sidebar visibility if needed
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

  /* ─── Auth ─── */

  const handleLogout = useCallback(async () => {
    await window.genfeedDesktop.auth.logout();
  }, []);

  /* ─── Navigation ─── */

  const handleNavigate = useCallback((view: NavView) => {
    setActiveView(view);
  }, []);

  const handleOpenWorkspace = useCallback(async () => {
    await window.genfeedDesktop.workspace.openWorkspace();
    await loadBootstrap();
  }, [loadBootstrap]);

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

  const handleGenerateFromTrend = useCallback(
    (trend: {
      id: string;
      platform: 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'youtube';
      topic: string;
    }) => {
      setActiveView('conversation');
      setPendingTrend(trend);
      const thread = createThread();
      const message = {
        content: `Generate content about: ${trend.topic}`,
        createdAt: new Date().toISOString(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user' as const,
      };
      addMessage(thread.id, message);
    },
    [createThread, addMessage],
  );

  /* ─── Render ─── */

  if (!bootstrap.session) {
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
      case 'workflows':
        return <WorkflowsView />;
      case 'agents':
        return <AgentsView />;
      case 'analytics':
        return <AnalyticsView workspaceId={selectedWorkspaceId} />;
      case 'library':
        return <LibraryView workspaceId={selectedWorkspaceId} />;
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
      <Sidebar
        activeThreadId={activeThreadId}
        activeView={activeView}
        onLogout={() => void handleLogout()}
        onNavigate={handleNavigate}
        onNewThread={handleNewThread}
        onOpenWorkspace={() => void handleOpenWorkspace()}
        onSelectThread={handleSelectThread}
        session={bootstrap.session}
        syncState={bootstrap.syncState}
        threads={threads}
        workspaces={bootstrap.workspaces}
      />
      <main className="main-area">{renderMainView()}</main>
    </div>
  );
};
