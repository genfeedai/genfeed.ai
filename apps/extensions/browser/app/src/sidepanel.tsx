import { ClerkProvider, useAuth } from '@clerk/chrome-extension';
import { useEffect, useState } from 'react';

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

import '~style.scss';

initializeErrorTracking('sidepanel');

function SidePanelContent() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasValidToken, setHasValidToken] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // Pending data from keyboard shortcuts / context menu
  const [pendingContent, setPendingContent] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingAuthor, setPendingAuthor] = useState('');

  // Listen for OPEN_MODE messages from the background/content scripts
  useEffect(() => {
    function handleMessage(message: {
      type?: string;
      payload?: ExtensionMessage;
    }) {
      if (message.type !== 'OPEN_MODE' || !message.payload) {
        return;
      }

      const { type, content, url, platform: _platform } = message.payload;

      setPendingContent(content ?? '');
      setPendingUrl(url ?? '');

      switch (type) {
        case 'REMIX':
          setActiveTab('remix');
          break;
        case 'REPLY':
          setActiveTab('reply');
          break;
        case 'IDEA':
          setActiveTab('idea');
          break;
        default:
          break;
      }
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
          setHasValidToken(true);
          setAuthError(null);
        } else {
          setHasValidToken(false);
          setAuthError(
            'Organization context is missing. Complete account setup in the web app, then reopen the side panel.',
          );
        }
        setIsSyncing(false);
        return;
      }

      if (isSignedIn) {
        try {
          const token = await getJWTToken(getToken);
          if (token) {
            await authService.setToken(token);
            const context = await authService.getAuthContext(true);
            if (context?.organization?.id) {
              setHasValidToken(true);
              setAuthError(null);
            } else {
              setHasValidToken(false);
              setAuthError(
                'Signed in, but organization context is unavailable. Open Genfeed web app to finish setup.',
              );
            }
          } else {
            setHasValidToken(false);
            setAuthError(
              'No auth token found. Sign in from the extension popup.',
            );
          }
        } catch (error) {
          logger.error('Error getting JWT token', error);
          setHasValidToken(false);
          setAuthError('Failed to synchronize auth. Try signing in again.');
        }
      } else {
        setHasValidToken(false);
        setAuthError('Sign in via the extension popup to get started.');
      }
      setIsSyncing(false);
    }

    syncAuth();
    loadSettings();
  }, [isLoaded, isSignedIn, getToken, loadSettings]);

  if (!isLoaded || isSyncing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner size="md" className="text-primary" />
      </div>
    );
  }

  if (!hasValidToken) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6">
        <p className="text-sm text-muted-foreground">
          {authError || 'Sign in via the extension popup to get started.'}
        </p>
      </div>
    );
  }

  const renderContent = () => {
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
        return <ThreadList onOpenThread={() => setActiveTab('chat')} />;
      case 'create':
        return <CreatePanel onStartChat={() => setActiveTab('chat')} />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ChatContainer />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-hidden">{renderContent()}</main>
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
