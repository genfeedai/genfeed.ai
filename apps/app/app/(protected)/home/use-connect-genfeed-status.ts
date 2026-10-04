import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  UseConnectGenfeedStatusOptions,
  UseConnectGenfeedStatusResult,
} from '@genfeedai/props/home/connect-genfeed-status.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ApiKeysService } from '@services/management/api-keys.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getVerifiedMcpConnections } from './operational-home.helpers';

export type {
  UseConnectGenfeedStatusOptions,
  UseConnectGenfeedStatusResult,
} from '@genfeedai/props/home/connect-genfeed-status.props';

export function useConnectGenfeedStatus(
  organizationId: string,
  { pollIntervalMs = false }: UseConnectGenfeedStatusOptions = {},
): UseConnectGenfeedStatusResult {
  const { isReady } = useBrand();
  const getApiKeysService = useAuthedService(
    useCallback((token: string) => ApiKeysService.getInstance(token), []),
  );
  const {
    data: apiKeys = [],
    error,
    isError,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isReady && organizationId.length > 0,
    queryFn: async () => {
      const service = await getApiKeysService();
      return await service.findAll({ limit: 100 });
    },
    queryKey: ['operational-home-connect-genfeed', organizationId],
    refetchInterval: pollIntervalMs,
    // The agent authorizes in another window or terminal; re-read the state
    // when the user comes back instead of showing the pre-connect snapshot.
    refetchOnWindowFocus: 'always',
  });

  const connections = useMemo(
    () => getVerifiedMcpConnections(apiKeys, organizationId),
    [apiKeys, organizationId],
  );
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const verifiedConnection = connections[0];

  if (!isReady || isLoading) {
    return {
      connections,
      error: null,
      key: null,
      refresh,
      status: 'loading',
      verifiedAt: null,
    };
  }

  if (isError) {
    return {
      connections,
      error,
      key: null,
      refresh,
      status: 'error',
      verifiedAt: null,
    };
  }

  if (verifiedConnection) {
    return {
      connections,
      error: null,
      key: verifiedConnection.apiKey,
      refresh,
      status: 'configured',
      verifiedAt: verifiedConnection.verifiedAt,
    };
  }

  return {
    connections,
    error: null,
    key: null,
    refresh,
    status: 'unconfigured',
    verifiedAt: null,
  };
}
