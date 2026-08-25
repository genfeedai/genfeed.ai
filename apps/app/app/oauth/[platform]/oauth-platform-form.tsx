'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { OAUTH_RETURN_TO_STORAGE_KEY } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { Button } from '@ui/primitives/button';
import { CircleCheck, CircleX } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AnalyticsPublicRouteSync from '@/components/analytics/AnalyticsPublicRouteSync';

interface OAuthPlatformFormProps {
  platform: string;
}

type VerifyResult =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; errorMessage: string };

const OAUTH1_PLATFORMS: string[] = [];

const REDIRECT_DELAY_MS = 3000;
const DEFAULT_RETURN_PATH = '/settings/api-keys';

const INITIAL_STATE: VerifyResult = { status: 'loading' };

function OAuthPlatformFormContent({ platform }: OAuthPlatformFormProps) {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const oauthToken = searchParams.get('oauth_token');
  const oauthVerifier = searchParams.get('oauth_verifier');
  const returnToParam = searchParams.get('return_to');
  const state = searchParams.get('state');
  const { push } = useRouter();
  const { isLoaded, isSignedIn } = useAuthIdentity();
  const [result, setResult] = useState<VerifyResult>(INITIAL_STATE);
  const hasVerified = useRef(false);
  const callbackQuery = searchParams.toString();
  const callbackPath = `/oauth/${encodeURIComponent(platform)}${
    callbackQuery ? `?${callbackQuery}` : ''
  }`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;

  const getServicesService = useAuthedService(
    (token: string) => new ServicesService(platform, token),
  );

  const resolveReturnTo = useCallback(() => {
    if (returnToParam) {
      return returnToParam;
    }
    try {
      return sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY);
    } catch {
      return null;
    }
  }, [returnToParam]);

  const clearStoredReturnTo = useCallback(() => {
    try {
      sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const verify = useCallback(
    async (forceRefresh = false) => {
      if (hasVerified.current) {
        return;
      }
      hasVerified.current = true;

      const url = `POST /services/${platform}/verify`;
      const returnTo = resolveReturnTo() || DEFAULT_RETURN_PATH;

      try {
        const service = await getServicesService(
          forceRefresh ? { forceRefresh: true } : undefined,
        );

        const isOAuth1 = OAUTH1_PLATFORMS.includes(platform);

        const body = isOAuth1
          ? {
              oauth_token: oauthToken,
              oauth_verifier: oauthVerifier,
            }
          : {
              code,
              state,
            };

        await service.postVerify(body);

        logger.info(`${url} success`);
        setResult({ status: 'success' });
        clearStoredReturnTo();

        setTimeout(() => {
          push(returnTo);
        }, REDIRECT_DELAY_MS);
      } catch (error) {
        logger.error(`${url} failed`, error);
        setResult({
          status: 'error',
          errorMessage: 'Failed to verify your account. Please try again.',
        });
      }
    },
    [
      clearStoredReturnTo,
      code,
      getServicesService,
      oauthToken,
      oauthVerifier,
      platform,
      push,
      resolveReturnTo,
      state,
    ],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    void verify();
  }, [isLoaded, isSignedIn, verify]);

  const retry = useCallback(() => {
    hasVerified.current = false;
    setResult(INITIAL_STATE);
    void verify(true);
  }, [verify]);

  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md text-center">
        {(!isLoaded || (isSignedIn && result.status === 'loading')) && (
          <div className="space-y-4">
            <div className="mx-auto size-16">
              <div className="size-16 animate-spin rounded-full border-b-2 border-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connecting your {platformLabel} account…
            </p>
          </div>
        )}

        {isLoaded && !isSignedIn && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Sign in required</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to finish connecting your {platformLabel} account.
            </p>
            <Button asChild withWrapper={false}>
              <Link href={loginHref}>Sign in to continue</Link>
            </Button>
          </div>
        )}

        {isSignedIn && result.status === 'success' && (
          <div className="space-y-4">
            <CircleCheck className="mx-auto text-5xl text-success" />
            <h2 className="text-lg font-semibold">{platformLabel} Connected</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you back…
            </p>
          </div>
        )}

        {isSignedIn && result.status === 'error' && (
          <div className="space-y-4">
            <CircleX className="mx-auto text-5xl text-destructive" />
            <h2 className="text-lg font-semibold">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">
              {result.errorMessage}
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={retry}>Try again</Button>
              <Button asChild variant={ButtonVariant.LINK} withWrapper={false}>
                <Link
                  href={resolveReturnTo() || DEFAULT_RETURN_PATH}
                  onClick={clearStoredReturnTo}
                >
                  Go back
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OAuthPlatformForm(
  props: Parameters<typeof OAuthPlatformFormContent>[0],
) {
  return (
    <>
      <AnalyticsPublicRouteSync />
      <Suspense fallback={null}>
        <OAuthPlatformFormContent {...props} />
      </Suspense>
    </>
  );
}
