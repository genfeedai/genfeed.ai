'use client';

import { useAuth } from '@clerk/nextjs';
import type { ITag } from '@genfeedai/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { TagCategory } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { TagsService } from '@services/content/tags.service';

export interface UseTagsOptions {
  scope?: TagCategory;
  autoLoad?: boolean;
}

export function useTags(options: UseTagsOptions = {}) {
  const { scope, autoLoad = true } = options;
  const { isSignedIn } = useAuth();
  const { brandId } = useBrand();

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  // Use useResource for proper AbortController cleanup (no mounted hack needed)
  const {
    data: tags,
    isLoading,
    error,
    refresh,
  } = useResource(
    async () => {
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
    {
      defaultValue: [] as ITag[],
      dependencies: [scope, brandId],
      enabled: autoLoad && !!isSignedIn,
    },
  );

  return {
    error,
    isLoading,
    loadTags: refresh,
    refresh,
    tags,
  };
}
