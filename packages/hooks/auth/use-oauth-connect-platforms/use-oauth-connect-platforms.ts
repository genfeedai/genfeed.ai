'use client';

import {
  type ResolvedOAuthConnectPlatform,
  resolveOAuthConnectPlatformCatalog,
} from '@genfeedai/helpers/oauth/oauth-connect-platforms';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type OAuthConnectReadinessResponse,
  ServicesService,
} from '@services/external/services.service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const OAUTH_CONNECT_READINESS_QUERY_KEY = 'oauth-connect-readiness';

/**
 * Resolve the shared OAuth catalog against live server readiness. A missing,
 * loading, or failed capability response is deliberately treated as unknown.
 */
export function useOAuthConnectPlatforms(): ResolvedOAuthConnectPlatform[] {
  const { isLoaded, isSignedIn, userId } = useAuthIdentity();
  const getThreadsService = useAuthedService(
    (token: string) => new ServicesService('threads', token),
  );
  const getGoogleBusinessService = useAuthedService(
    (token: string) => new ServicesService('google-business', token),
  );
  const { data: threadsData, error: threadsError } = useQuery({
    enabled: isLoaded && isSignedIn,
    queryFn: async () => {
      const service = await getThreadsService();
      return service.getConnectReadiness();
    },
    queryKey: [
      OAUTH_CONNECT_READINESS_QUERY_KEY,
      'threads',
      userId ?? 'anonymous',
    ],
    retry: false,
  });
  const { data: googleBusinessData, error: googleBusinessError } = useQuery({
    enabled: isLoaded && isSignedIn,
    queryFn: async () => {
      const service = await getGoogleBusinessService();
      return service.getConnectReadiness();
    },
    queryKey: [
      OAUTH_CONNECT_READINESS_QUERY_KEY,
      'google_business',
      userId ?? 'anonymous',
    ],
    retry: false,
  });
  const threadsReadiness = toReadiness(threadsData, threadsError);
  const googleBusinessReadiness = toReadiness(
    googleBusinessData,
    googleBusinessError,
  );

  return useMemo(
    () =>
      resolveOAuthConnectPlatformCatalog({
        google_business: googleBusinessReadiness,
        threads: threadsReadiness,
      }),
    [googleBusinessReadiness, threadsReadiness],
  );
}

function toReadiness(
  data: OAuthConnectReadinessResponse | undefined,
  error: unknown,
): 'available' | 'unavailable' | 'unknown' {
  return !error &&
    (data?.status === 'available' || data?.status === 'unavailable')
    ? data.status
    : 'unknown';
}
