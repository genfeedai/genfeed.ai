import { ClerkProvider, useAuth } from '@clerk/chrome-extension';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useEffect, useReducer } from 'react';
import LoginPage from '~components/pages/LoginPage';
import { LoadingSpinner } from '~components/ui';
import { authService, getJWTToken } from '~services/auth.service';
import { EnvironmentService } from '~services/environment.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { logger } from '~utils/logger.util';
import '~style.css';

initializeErrorTracking('popup');

function PopupContent() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const [authState, setAuthState] = useReducer(
    (
      _state: 'syncing' | 'authenticated' | 'unauthenticated',
      nextState: 'syncing' | 'authenticated' | 'unauthenticated',
    ) => nextState,
    'syncing',
  );

  useEffect(() => {
    async function syncAuth() {
      if (!isLoaded) {
        return;
      }

      const existingToken = await authService.getToken();
      if (existingToken) {
        setAuthState('authenticated');
        return;
      }

      let nextState: 'authenticated' | 'unauthenticated' = 'unauthenticated';

      if (isSignedIn) {
        try {
          const token = await getJWTToken(getToken);
          if (token) {
            await authService.setToken(token);
            nextState = 'authenticated';
          }
        } catch (error) {
          logger.error('Error getting JWT token', error);
        }
      }
      setAuthState(nextState);
    }
    syncAuth();
  }, [isLoaded, isSignedIn, getToken]);

  const handleLogout = async () => {
    await signOut();
    await authService.clearToken();
    setAuthState('unauthenticated');
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

  if (!isLoaded || authState === 'syncing') {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" className="text-primary" />
      </div>
    );
  }

  if (authState !== 'authenticated') {
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
            <h1 className="text-xl font-semibold text-foreground">Genfeed</h1>
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
