import { ClerkProvider, useAuth } from '@clerk/chrome-extension';
import { type ReactElement, useEffect, useReducer } from 'react';

import { ChatContainer } from '~components/chat/ChatContainer';
import { CreatePanel } from '~components/create/CreatePanel';
import { ThreadList } from '~components/history/ThreadList';
import { type ActiveTab, SidebarNav } from '~components/navigation/SidebarNav';
import { IdeaDraftPage } from '~components/pages/IdeaDraftPage';
import { RemixPage } from '~components/pages/RemixPage';
import { ReplyPage } from '~components/pages/ReplyPage';
import { SettingsPanel } from '~components/settings/SettingsPanel';
import { LoadingSpinner } from '~components/ui';
import { authService, getJWTToken } from '~services/auth.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { useSettingsStore } from '~store/use-settings-store';
import type { ExtensionMessage } from '~types/extension';
import { logger } from '~utils/logger.util';

import '~style.css';

initializeErrorTracking('sidepanel');

type AuthPanelState =
  | { status: 'syncing'; error: null }
  | { status: 'authenticated'; error: null }
  | { status: 'blocked'; error: string };

interface PanelState {
  activeTab: ActiveTab;
  pendingAuthor: string;
  pendingContent: string;
  pendingUrl: string;
}

type PanelAction =
  | { type: 'openMode'; payload: ExtensionMessage }
  | { type: 'setActiveTab'; activeTab: ActiveTab };

function authReducer(_state: AuthPanelState, next: AuthPanelState) {
  return next;
}

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'openMode': {
      const { type, content, url } = action.payload;
      const activeTabByMessage: Record<ExtensionMessage['type'], ActiveTab> = {
        IDEA: 'idea',
        REMIX: 'remix',
        REPLY: 'reply',
      };

      return {
        ...state,
        activeTab: activeTabByMessage[type],
        pendingContent: content ?? '',
        pendingUrl: url ?? '',
      };
    }
    case 'setActiveTab':
      return { ...state, activeTab: action.activeTab };
    default:
      return state;
  }
}

function SidePanelRoute({
  activeTab,
  pendingAuthor,
  pendingContent,
  pendingUrl,
  onActiveTabChange,
}: PanelState & {
  onActiveTabChange: (activeTab: ActiveTab) => void;
}): ReactElement {
  switch (activeTab) {
    case 'chat':
      return <ChatContainer />;
    case 'remix':
      return (
        <RemixPage initialContent={pendingContent} initialUrl={pendingUrl} />
      );
    case 'reply':
      return (
        <ReplyPage
          initialContent={pendingContent}
          initialUrl={pendingUrl}
          initialAuthor={pendingAuthor}
        />
      );
    case 'idea':
      return (
        <IdeaDraftPage
          initialContent={pendingContent}
          initialUrl={pendingUrl}
        />
      );
    case 'history':
      return <ThreadList onOpenThread={() => onActiveTabChange('chat')} />;
    case 'create':
      return <CreatePanel onStartChat={() => onActiveTabChange('chat')} />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return <ChatContainer />;
  }
}

function SidePanelContent() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [authState, dispatchAuthState] = useReducer(authReducer, {
    error: null,
    status: 'syncing',
  });
  const [panelState, dispatchPanel] = useReducer(panelReducer, {
    activeTab: 'chat',
    pendingAuthor: '',
    pendingContent: '',
    pendingUrl: '',
  } satisfies PanelState);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // Listen for OPEN_MODE messages from the background/content scripts
  useEffect(() => {
    function handleMessage(message: {
      type?: string;
      payload?: ExtensionMessage;
    }) {
      if (message.type !== 'OPEN_MODE' || !message.payload) {
        return;
      }
      dispatchPanel({ payload: message.payload, type: 'openMode' });
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    async function syncAuth() {
      if (!isLoaded) {
        return;
      }

      const existingToken = await authService.getToken();
      if (existingToken) {
        const context = await authService.getAuthContext();
        if (context?.organization?.id) {
          dispatchAuthState({ error: null, status: 'authenticated' });
        } else {
          dispatchAuthState({
            error:
              'Organization context is missing. Complete account setup in the web app, then reopen the side panel.',
            status: 'blocked',
          });
        }
        return;
      }

      let nextAuthState: AuthPanelState = {
        error: 'Sign in via the extension popup to get started.',
        status: 'blocked',
      };

      if (isSignedIn) {
        try {
          const token = await getJWTToken(getToken);
          if (token) {
            await authService.setToken(token);
            const context = await authService.getAuthContext(true);
            if (context?.organization?.id) {
              nextAuthState = { error: null, status: 'authenticated' };
            } else {
              nextAuthState = {
                error:
                  'Signed in, but organization context is unavailable. Open Genfeed web app to finish setup.',
                status: 'blocked',
              };
            }
          } else {
            nextAuthState = {
              error: 'No auth token found. Sign in from the extension popup.',
              status: 'blocked',
            };
          }
        } catch (error) {
          logger.error('Error getting JWT token', error);
          nextAuthState = {
            error: 'Failed to synchronize auth. Try signing in again.',
            status: 'blocked',
          };
        }
      }
      dispatchAuthState(nextAuthState);
    }

    syncAuth();
    loadSettings();
  }, [isLoaded, isSignedIn, getToken, loadSettings]);

  if (!isLoaded || authState.status === 'syncing') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner size="md" className="text-primary" />
      </div>
    );
  }

  if (authState.status !== 'authenticated') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6">
        <p className="text-sm text-muted-foreground">
          {authState.error || 'Sign in via the extension popup to get started.'}
        </p>
      </div>
    );
  }

  const setActiveTab = (activeTab: ActiveTab) =>
    dispatchPanel({ activeTab, type: 'setActiveTab' });

  return (
    <div className="flex h-screen bg-background text-foreground">
      <SidebarNav activeTab={panelState.activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-hidden">
        <SidePanelRoute {...panelState} onActiveTabChange={setActiveTab} />
      </main>
    </div>
  );
}

export default function SidePanel() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark');
    document.body.setAttribute('data-theme', 'dark');
  }, []);

  const extensionUrl = chrome.runtime.getURL('.');

  return (
    <ClerkProvider
      publishableKey={process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''}
      afterSignOutUrl={`${extensionUrl}/sidepanel.html`}
      signInFallbackRedirectUrl={`${extensionUrl}/sidepanel.html`}
      signUpFallbackRedirectUrl={`${extensionUrl}/sidepanel.html`}
    >
      <SidePanelContent />
    </ClerkProvider>
  );
}
