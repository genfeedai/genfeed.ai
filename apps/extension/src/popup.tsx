import { useAuth } from '@genfeedai/auth-client/react';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import Image from 'next/image';
import { useEffect } from 'react';
import LoginPage from '~components/pages/LoginPage';
import { useAccountThemeSync } from '~hooks/use-account-theme-sync';
import { useExtensionTheme } from '~hooks/use-extension-theme';
import { useWorkspace } from '~hooks/use-workspace';
import { authService } from '~services/auth.service';
import { appDomain, logoURL } from '~services/environment.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { loadWorkspace } from '~services/workspace.service';
import { logger } from '~utils/logger.util';
import '~style.css';

initializeErrorTracking('popup');

function handleOpenSidePanel() {
  chrome.sidePanel
    .open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
    .then(() => window.close())
    .catch(() => {
      // Fallback: if sidePanel.open is not available, notify the user
      logger.error('Failed to open side panel');
    });
}

function PopupContent() {
  const { isLoaded, signOut } = useAuth();
  const workspace = useWorkspace();
  const authState =
    workspace.status === 'ready' || workspace.status === 'refreshing'
      ? 'authenticated'
      : workspace.status === 'loading'
        ? 'syncing'
        : 'unauthenticated';
  useAccountThemeSync(workspace.status === 'ready');

  const handleLogout = async () => {
    await signOut();
    await authService.clearToken();
    void loadWorkspace({ forceRefresh: true }).catch(() => undefined);
  };

  if (!isLoaded || authState === 'syncing') {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (authState !== 'authenticated') {
    return (
      <div className="w-80 min-h-[300px] bg-muted text-foreground gf-app">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Image
              src={logoURL}
              width={30}
              height={30}
              alt="Genfeed"
              className="dark:invert"
            />
            <h1 className="text-xl font-semibold text-foreground">Genfeed</h1>
          </div>
          <p role="alert">
            {workspace.status === 'blocked'
              ? workspace.error
              : 'Sign in to Genfeed.'}
          </p>
          <Button
            onClick={() => {
              void loadWorkspace({ forceRefresh: true }).catch(() => undefined);
            }}
          >
            Retry
          </Button>
          <Button
            onClick={() => {
              void chrome.tabs.create({ url: appDomain });
            }}
          >
            Open Genfeed
          </Button>
          <LoginPage />
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-muted text-foreground gf-app">
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Image
              src={logoURL}
              width={30}
              height={30}
              alt="Genfeed"
              className="dark:invert"
            />
            <h1 className="text-xl font-semibold text-foreground">Genfeed</h1>
          </div>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Logout
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-muted-foreground text-center">
            {workspace.status === 'ready'
              ? `${workspace.snapshot.organizationLabel} · ${workspace.snapshot.brands.find((brand) => brand.id === workspace.snapshot.brandId)?.label ?? 'Select a brand'} · ${workspace.snapshot.userId}`
              : ''}
            Open the side panel to chat with your AI content assistant.
          </p>
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            onClick={handleOpenSidePanel}
            className="px-6 py-3"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Open Side Panel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IndexPopup() {
  const isThemeReady = useExtensionTheme();

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return isThemeReady ? <PopupContent /> : null;
}
