'use client';

import { useAuth } from '@clerk/nextjs';
import { AssetSelectionProvider } from '@genfeedai/contexts/ui/asset-selection-context';
import { BackgroundTaskProvider } from '@genfeedai/contexts/ui/background-task-context';
import { BrandProvider } from '@genfeedai/contexts/user/brand-context/brand-context';
import { UserProvider } from '@genfeedai/contexts/user/user-context/user-context';
import {
  getPlaywrightAuthState,
  hasPlaywrightJwtToken,
  resolveClerkToken,
} from '@genfeedai/helpers/auth/clerk.helper';
import { clearTokenCache } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import type { ProtectedBootstrapData } from '@genfeedai/props/layout/protected-bootstrap.props';
import { AccessStateProvider } from '@providers/access-state/access-state.provider';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import ElementsProvider from '@providers/elements/elements.provider';
import { GlobalModalsProvider } from '@providers/global-modals/global-modals.provider';
import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

export interface ProtectedProvidersProps extends LayoutProps {
  includeBrandProvider?: boolean;
  includeElementsProvider?: boolean;
  includePromptBarProvider?: boolean;
  includeAssetSelectionProvider?: boolean;
  includeApiStatusCheck?: boolean;
  initialBootstrap?: ProtectedBootstrapData | null;
  additionalProviders?: (children: ReactNode) => ReactNode;
}

function ProtectedAuthGate({ children }: LayoutProps): ReactNode {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const effectiveUserId = userId ?? playwrightAuth?.userId ?? null;
  const [hasJwtToken, setHasJwtToken] = useState(false);

  const sessionKey = useMemo(
    () => `${effectiveUserId ?? 'none'}:${effectiveIsSignedIn ? 'in' : 'out'}`,
    [effectiveIsSignedIn, effectiveUserId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger — sessionKey changes drive cache clear
  useEffect(() => {
    clearTokenCache();
  }, [sessionKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionKey as a change trigger for auth token refresh
  useEffect(() => {
    if (!effectiveIsAuthLoaded || !effectiveIsSignedIn) {
      setHasJwtToken(false);
      return;
    }

    if (playwrightAuth?.isSignedIn === true && hasPlaywrightJwtToken()) {
      setHasJwtToken(true);
      return;
    }

    let isCancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const ensureToken = async (): Promise<void> => {
      try {
        const token = await resolveClerkToken(getToken);

        if (isCancelled) {
          return;
        }

        if (token) {
          setHasJwtToken(true);
          return;
        }
      } catch {
        if (isCancelled) {
          return;
        }
      }

      retryTimeout = setTimeout(() => {
        void ensureToken();
      }, 150);
    };

    setHasJwtToken(false);
    void ensureToken();

    return () => {
      isCancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    getToken,
    playwrightAuth?.isSignedIn,
    sessionKey,
  ]);

  if (!effectiveIsAuthLoaded || !effectiveIsSignedIn || !hasJwtToken) {
    return null;
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
}: ProtectedProvidersProps): ReactNode {
  let content: ReactNode = children;

  if (additionalProviders) {
    content = additionalProviders(children);
  }

  content = <GlobalModalsProvider>{content}</GlobalModalsProvider>;

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
    <AccessStateProvider initialAccessState={initialBootstrap?.accessState}>
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
    <UserProvider initialCurrentUser={initialBootstrap?.currentUser}>
      {content}
    </UserProvider>
  );

  // API status check wraps everything - shows error screen if API is down
  if (includeApiStatusCheck) {
    content = <ApiStatusProvider>{content}</ApiStatusProvider>;
  }

  // LOCAL mode: bypass Clerk auth gate — backend handles identity via LocalIdentityInterceptor.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return content;
  }

  return <ProtectedAuthGate>{content}</ProtectedAuthGate>;
}
