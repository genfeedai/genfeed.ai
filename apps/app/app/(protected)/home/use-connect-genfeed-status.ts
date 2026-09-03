'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ApiKeysService } from '@services/management/api-keys.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getVerifiedMcpConnection } from './operational-home.helpers';

export type UseConnectGenfeedStatusResult =
  | {
      error: null;
      key: ApiKey;
      refresh: () => Promise<void>;
      status: 'configured';
      verifiedAt: string;
    }
  | {
      error: Error;
      key: null;
      refresh: () => Promise<void>;
      status: 'error';
      verifiedAt: null;
    }
  | {
      error: null;
      key: null;
      refresh: () => Promise<void>;
      status: 'loading' | 'unconfigured';
      verifiedAt: null;
    };

export function useConnectGenfeedStatus(
  organizationId: string,
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
  });

  const verifiedConnection = useMemo(
    () => getVerifiedMcpConnection(apiKeys, organizationId),
    [apiKeys, organizationId],
  );
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (!isReady || isLoading) {
    return {
      error: null,
      key: null,
      refresh,
      status: 'loading',
      verifiedAt: null,
    };
  }

  if (isError) {
    return {
      error,
      key: null,
      refresh,
      status: 'error',
      verifiedAt: null,
    };
  }

  if (verifiedConnection) {
    return {
      error: null,
      key: verifiedConnection.apiKey,
      refresh,
      status: 'configured',
      verifiedAt: verifiedConnection.verifiedAt,
    };
  }

  return {
    error: null,
    key: null,
    refresh,
    status: 'unconfigured',
    verifiedAt: null,
  };
}
