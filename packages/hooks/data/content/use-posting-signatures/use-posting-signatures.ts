'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IPostingSignature } from '@genfeedai/contracts/interfaces';
import { PostingSignaturesService } from '@genfeedai/services/content/posting-signatures.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { UsePostingSignaturesResult } from '@props/content/posting-sets.props';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export const POSTING_SIGNATURES_QUERY_KEY = 'posting-signatures';

export function usePostingSignatures(): UsePostingSignaturesResult {
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();
  const { isReady, organizationId, pageScope } = useCollectionScope();
  const getService = useAuthedService((token: string) =>
    PostingSignaturesService.getInstance(token),
  );
  const isEnabled = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });

  const queryKey = useMemo(
    () => [POSTING_SIGNATURES_QUERY_KEY, organizationId, brandId ?? null],
    [brandId, organizationId],
  );

  const { data: signatures = [], isLoading } = useQuery({
    enabled: isEnabled && Boolean(isSignedIn),
    queryFn: async () => {
      const service = await getService();
      return (await service.findAll({
        ...toBrandListParams({ brandId }),
        isEnabled: true,
        limit: 100,
      })) as IPostingSignature[];
    },
    queryKey,
  });

  return {
    isLoading: !isEnabled || isLoading,
    signatures,
  };
}
