'use client';

import { isBetterAuthEnabled } from '@genfeedai/auth-client';
import { AssetSelectionProvider } from '@genfeedai/contexts/ui/asset-selection-context';
import { BackgroundTaskProvider } from '@genfeedai/contexts/ui/background-task-context';
import { BrandProvider } from '@genfeedai/contexts/user/brand-context/brand-context';
import { UserProvider } from '@genfeedai/contexts/user/user-context/user-context';
import {
  getPlaywrightAuthState,
  hasPlaywrightJwtToken,
  resolveAuthToken,
} from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import type { GlobalModalRenderer } from '@genfeedai/props/modals/global-modals.props';
import { AccessStateProvider } from '@providers/access-state/access-state.provider';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import ElementsProvider from '@providers/elements/elements.provider';
import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import ThemePreferenceSync from '@providers/theme-sync/theme-preference-sync';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { redirectToLoginWithoutSession } from '@/lib/auth/redirect-without-session';
import type { ProtectedAuthGateProps } from '@/props/providers/protected-auth-gate.props';
import { GlobalModalsProvider } from '@/providers/global-modals/global-modals.provider';

export interface ProtectedProvidersProps extends LayoutProps {
  includeBrandProvider?: boolean;
  includeElementsProvider?: boolean;
  includePromptBarProvider?: boolean;
  includeAssetSelectionProvider?: boolean;
  includeApiStatusCheck?: boolean;
  initialBootstrap?: ProtectedBootstrapData | null;
  renderModal?: GlobalModalRenderer;
  additionalProviders?: (children: ReactNode) => ReactNode;
  /** Rendered by the auth gate while the session token resolves. */
  authPendingFallback?: ReactNode;
  /**
   * Rendered once the token has not arrived within `TOKEN_WAIT_TIMEOUT_MS`,
   * with a callback that starts the wait again. Without it the gate keeps
   * showing `authPendingFallback`.
   */
  authFailureFallback?: ProtectedAuthGateProps['failureFallback'];
}

/**
 * How long the auth gate waits for the session token before it shows the
 * failure fallback. The wait itself keeps retrying behind that message.
 */
export const TOKEN_WAIT_TIMEOUT_MS = 20_000;
const TOKEN_RETRY_MIN_MS = 150;
const TOKEN_RETRY_MAX_MS = 2_000;

export function ProtectedAuthGate({
  children,
  failureFallback,
  fallback = null,
}: ProtectedAuthGateProps): ReactNode {
  const {
    getToken,
    isLoaded: isAuthLoaded,
    isSignedIn,
    orgId,
    sessionId,
    userId,
  } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const [hasJwtToken, setHasJwtToken] = useState(false);
  const [hasTokenTimedOut, setHasTokenTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const hasBeenSignedInRef = useRef(false);
  const retryTokenWait = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const sessionKey = [
    sessionId ?? 'no-session',
    effectiveUserId ?? 'none',
    orgId ?? playwrightAuth?.orgId ?? 'no-org',
    effectiveIsSignedIn ? 'in' : 'out',
  ].join(':');

  // use-effect-audit: ignore refreshes the auth token on a session change and retries on a timer, aborting on cleanup
  useEffect(() => {
    void sessionKey;
    void retryNonce;
    if (effectiveIsSignedIn) {
      hasBeenSignedInRef.current = true;
    }
    if (!effectiveIsAuthLoaded || !effectiveIsSignedIn) {
      setHasJwtToken(false);
      setHasTokenTimedOut(false);
      // A visitor who arrives with a session cookie the API does not accept
      // (expired, revoked) has no page-load redirect any more: the proxy no
      // longer asks the API before it sends a scoped page. One who was signed
      // in here and signed out is already sent away by `SignedOutRedirect`.
      if (effectiveIsAuthLoaded && !hasBeenSignedInRef.current) {
        const signedOutAbort = new AbortController();
        void redirectToLoginWithoutSession(signedOutAbort.signal).catch(
          () => undefined,
        );
        return () => signedOutAbort.abort();
      }
      return;
    }

    if (playwrightAuth?.isSignedIn === true && hasPlaywrightJwtToken()) {
      setHasJwtToken(true);
      return;
    }

    const abortController = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = TOKEN_RETRY_MIN_MS;
    // A token that never comes (the exchange answers with an error, or never
    // answers) must end in a message, not in the loading frame for good.
    const timeoutTimer = setTimeout(
      () => setHasTokenTimedOut(true),
      TOKEN_WAIT_TIMEOUT_MS,
    );

    const ensureToken = async (): Promise<void> => {
      try {
        const token = await resolveAuthToken(getToken);

        if (abortController.signal.aborted) {
          return;
        }

        if (token) {
          clearTimeout(timeoutTimer);
          setHasTokenTimedOut(false);
          setHasJwtToken(true);
          return;
        }
      } catch {
        if (abortController.signal.aborted) {
          return;
        }
      }

      retryTimeout = setTimeout(() => {
        void ensureToken();
      }, retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, TOKEN_RETRY_MAX_MS);
    };

    setHasJwtToken(false);
    setHasTokenTimedOut(false);
    void ensureToken();

    return () => {
      abortController.abort();
      clearTimeout(timeoutTimer);
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    getToken,
    playwrightAuth?.isSignedIn,
    retryNonce,
    sessionKey,
  ]);

  if (!effectiveIsAuthLoaded || !effectiveIsSignedIn || !hasJwtToken) {
    if (
      hasTokenTimedOut &&
      effectiveIsAuthLoaded &&
      effectiveIsSignedIn &&
      failureFallback
    ) {
      return failureFallback(retryTokenWait);
    }
    return fallback;
  }

  return children;
}

export default function ProtectedProviders({
  children,
  includeBrandProvider = true,
  includeElementsProvider = true,
  includePromptBarProvider = true,
  includeAssetSelectionProvider = true,
  includeApiStatusCheck = true,
  initialBootstrap,
  additionalProviders,
  authPendingFallback,
  authFailureFallback,
  renderModal,
}: ProtectedProvidersProps): ReactNode {
  const isDesktop = useIsDesktopClient();
  let content: ReactNode = children;
  const hasInitialBootstrap = initialBootstrap != null;

  if (additionalProviders) {
    content = additionalProviders(children);
  }

  // Innermost on purpose: this is the only layer that sits inside both
  // UserProvider and (when enabled) BrandProvider, so the sync sees the personal
  // and organization halves of the locale preference. Without BrandProvider,
  // `useBrand()` falls back to its default context and the personal preference
  // still applies.
  content = (
    <GlobalModalsProvider renderModal={renderModal}>
      <ThemePreferenceSync />
      {content}
    </GlobalModalsProvider>
  );

  if (includeAssetSelectionProvider) {
    content = <AssetSelectionProvider>{content}</AssetSelectionProvider>;
  }

  content = <BackgroundTaskProvider>{content}</BackgroundTaskProvider>;

  content = (
    <PromptBarProvider enabled={includePromptBarProvider}>
      {content}
    </PromptBarProvider>
  );
  content = (
    <ElementsProvider enabled={includeElementsProvider}>
      {content}
    </ElementsProvider>
  );

  content = (
    <AccessStateProvider
      hasInitialBootstrap={hasInitialBootstrap}
      initialAccessState={initialBootstrap?.accessState}
    >
      {content}
    </AccessStateProvider>
  );

  if (includeBrandProvider) {
    content = (
      <BrandProvider initialBootstrap={initialBootstrap}>
        {content}
      </BrandProvider>
    );
  }

  content = (
    <UserProvider
      hasInitialBootstrap={hasInitialBootstrap}
      initialCurrentUser={initialBootstrap?.currentUser}
      initialMemberRole={initialBootstrap?.accessState?.memberRole}
      initialOrganizationId={initialBootstrap?.organizationId}
    >
      {content}
    </UserProvider>
  );

  // API status check wraps everything - shows error screen if API is down
  if (includeApiStatusCheck) {
    content = <ApiStatusProvider>{content}</ApiStatusProvider>;
  }

  // LOCAL mode: bypass the auth gate only when Better Auth is explicitly
  // disabled; backend identity then comes from LocalIdentityInterceptor.
  if (!isBetterAuthEnabled()) {
    return content;
  }

  // DESKTOP mode: bypass token gate — auth is handled by the desktop session bridge.
  // In offline mode getToken() returns '' which never satisfies hasJwtToken, causing a black screen.
  if (isDesktop) {
    return content;
  }

  return (
    <ProtectedAuthGate
      failureFallback={authFailureFallback}
      fallback={authPendingFallback}
    >
      {content}
    </ProtectedAuthGate>
  );
}
