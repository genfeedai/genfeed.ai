'use client';

import type { TagCategory } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery } from '@tanstack/react-query';

export interface UseTagsOptions {
  scope?: TagCategory;
  autoLoad?: boolean;
}

export function useTags(options: UseTagsOptions = {}) {
  const { scope, autoLoad = true } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useCollectionScope();

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  const {
    data: tags = [] as ITag[],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tags', scope, brandId],
    queryFn: async () => {
      const service = await getTagsService();
      const params: Record<string, string> = {};

      if (scope) {
        params.category = scope;
      }

      if (brandId) {
        params.brand = brandId;
      }

      return (await service.findAll(params)) as ITag[];
    },
    enabled: autoLoad && !!isSignedIn,
  });

  return {
    error,
    isLoading,
    loadTags: refetch,
    refresh: refetch,
    tags,
  };
}
