'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

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
  const returnTo = searchParams.get('return_to');
  const state = searchParams.get('state');
  const { push } = useRouter();
  const [result, setResult] = useState<VerifyResult>(INITIAL_STATE);
  const hasVerified = useRef(false);

  const getServicesService = useAuthedService(
    (token: string) => new ServicesService(platform, token),
  );

  const verify = useCallback(async () => {
    if (hasVerified.current) {
      return;
    }
    hasVerified.current = true;

    const url = `POST /services/${platform}/verify`;

    try {
      const service = await getServicesService();

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

      setTimeout(() => {
        push(returnTo || DEFAULT_RETURN_PATH);
      }, REDIRECT_DELAY_MS);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setResult({
        status: 'error',
        errorMessage: 'Failed to verify your account. Please try again.',
      });
    }
  }, [
    code,
    getServicesService,
    oauthToken,
    oauthVerifier,
    platform,
    push,
    returnTo,
    state,
  ]);

  useEffect(() => {
    verify();
  }, [verify]);

  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md text-center">
        {result.status === 'loading' && (
          <div className="space-y-4">
            <div className="mx-auto size-16">
              <div className="size-16 animate-spin rounded-full border-b-2 border-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connecting your {platformLabel} account…
            </p>
          </div>
        )}

        {result.status === 'success' && (
          <div className="space-y-4">
            <HiCheckCircle className="mx-auto text-5xl text-success" />
            <h2 className="text-lg font-semibold">{platformLabel} Connected</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you back…
            </p>
          </div>
        )}

        {result.status === 'error' && (
          <div className="space-y-4">
            <HiXCircle className="mx-auto text-5xl text-destructive" />
            <h2 className="text-lg font-semibold">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">
              {result.errorMessage}
            </p>
            <a
              href={returnTo || DEFAULT_RETURN_PATH}
              className="inline-block text-sm text-primary underline"
            >
              Go back
            </a>
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
    <Suspense fallback={null}>
      <OAuthPlatformFormContent {...props} />
    </Suspense>
  );
}
