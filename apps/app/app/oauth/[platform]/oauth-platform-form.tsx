'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

interface OAuthPlatformFormProps {
  platform: string;
}

type VerifyStatus = 'loading' | 'success' | 'error';

const OAUTH1_PLATFORMS: string[] = [];

const REDIRECT_DELAY_MS = 3000;

export default function OAuthPlatformForm({
  platform,
}: OAuthPlatformFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
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
            oauth_token: searchParams.get('oauth_token'),
            oauth_verifier: searchParams.get('oauth_verifier'),
          }
        : {
            code: searchParams.get('code'),
            state: searchParams.get('state'),
          };

      await service.postVerify(body);

      logger.info(`${url} success`);
      setStatus('success');

      const returnTo = searchParams.get('return_to');
      setTimeout(() => {
        router.push(returnTo || '/settings/brands');
      }, REDIRECT_DELAY_MS);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setStatus('error');
      setErrorMessage('Failed to verify your account. Please try again.');
    }
  }, [getServicesService, platform, router, searchParams]);

  useEffect(() => {
    verify();
  }, [verify]);

  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md text-center">
        {status === 'loading' && (
          <div className="space-y-4">
            <div className="mx-auto h-16 w-16">
              <div className="h-16 w-16 animate-spin rounded-full border-b-2 border-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connecting your {platformLabel} account...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <HiCheckCircle className="mx-auto text-5xl text-green-500" />
            <h2 className="text-lg font-semibold">{platformLabel} Connected</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting you back...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <HiXCircle className="mx-auto text-5xl text-red-500" />
            <h2 className="text-lg font-semibold">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <a
              href={searchParams.get('return_to') || '/settings/brands'}
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
