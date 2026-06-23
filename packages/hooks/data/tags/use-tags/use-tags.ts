'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { TagCategory } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';

export interface UseTagsOptions {
  scope?: TagCategory;
  autoLoad?: boolean;
}

export function useTags(options: UseTagsOptions = {}) {
  const { scope, autoLoad = true } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();

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
