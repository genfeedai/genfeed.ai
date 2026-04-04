import { ClerkProvider, useAuth } from '@clerk/chrome-extension';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import LoginPage from '~components/pages/LoginPage';
import { LoadingSpinner } from '~components/ui';
import { EnvironmentService } from '~services';
import { authService, getJWTToken } from '~services/auth.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { logger } from '~utils/logger.util';
import '~style.scss';

initializeErrorTracking('popup');

function PopupContent() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasValidToken, setHasValidToken] = useState(false);

  useEffect(() => {
    async function syncAuth() {
      if (!isLoaded) {
        return;
      }

      const existingToken = await authService.getToken();
      if (existingToken) {
        setHasValidToken(true);
        setIsSyncing(false);
        return;
      }

      if (isSignedIn) {
        try {
          const token = await getJWTToken(getToken);
          if (token) {
            await authService.setToken(token);
            setHasValidToken(true);
          } else {
            setHasValidToken(false);
          }
        } catch (error) {
          logger.error('Error getting JWT token', error);
          setHasValidToken(false);
        }
      } else {
        setHasValidToken(false);
      }
      setIsSyncing(false);
    }
    syncAuth();
  }, [isLoaded, isSignedIn, getToken]);

  const handleLogout = async () => {
    await signOut();
    await authService.clearToken();
    setHasValidToken(false);
  };

  function handleOpenSidePanel() {
    chrome.sidePanel
      .open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
      .then(() => window.close())
      .catch(() => {
        // Fallback: if sidePanel.open is not available, notify the user
        logger.error('Failed to open side panel');
      });
  }

  if (!isLoaded || isSyncing) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" className="text-primary" />
      </div>
    );
  }

  if (!hasValidToken) {
    return (
      <div className="w-80 min-h-[300px] bg-muted text-foreground gf-app">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Image
              src={EnvironmentService.logoURL}
              width={30}
              height={30}
              alt="Genfeed"
            />
            <h1 className="text-xl font-bold text-foreground">Genfeed</h1>
          </div>
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
              src={EnvironmentService.logoURL}
              width={30}
              height={30}
              alt="Genfeed"
            />
            <h1 className="text-xl font-bold text-foreground">Genfeed</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Logout
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-muted-foreground text-center">
            Open the side panel to chat with your AI content assistant.
          </p>
          <button
            type="button"
            onClick={handleOpenSidePanel}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IndexPopup() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark');
    document.body.setAttribute('data-theme', 'dark');

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const extensionUrl = chrome.runtime.getURL('.');

  return (
    <ClerkProvider
      publishableKey={process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''}
      afterSignOutUrl={`${extensionUrl}/popup.html`}
      signInFallbackRedirectUrl={`${extensionUrl}/popup.html`}
      signUpFallbackRedirectUrl={`${extensionUrl}/popup.html`}
    >
      <PopupContent />
    </ClerkProvider>
  );
}
