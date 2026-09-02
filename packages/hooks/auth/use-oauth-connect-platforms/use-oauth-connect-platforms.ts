'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ServicesService } from '@services/external/services.service';
import { useQuery } from '@tanstack/react-query';
import {
  type ResolvedOAuthConnectPlatform,
  resolveOAuthConnectPlatformCatalog,
} from '@ui/constants/oauth-connect-platforms';
import { useMemo } from 'react';

export const OAUTH_CONNECT_READINESS_QUERY_KEY = 'oauth-connect-readiness';

/**
 * Resolve the shared OAuth catalog against live server readiness. A missing,
 * loading, or failed capability response is deliberately treated as unknown.
 */
export function useOAuthConnectPlatforms(): ResolvedOAuthConnectPlatform[] {
  const { isLoaded, isSignedIn, userId } = useAuthIdentity();
  const getThreadsService = useAuthedService(
    (token: string) => new ServicesService('threads', token),
  );
  const { data, error } = useQuery({
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
  const threadsReadiness =
    !error && (data?.status === 'available' || data?.status === 'unavailable')
      ? data.status
      : 'unknown';

  return useMemo(
    () =>
      resolveOAuthConnectPlatformCatalog({
        threads: threadsReadiness,
      }),
    [threadsReadiness],
  );
}
