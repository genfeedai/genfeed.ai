'use client';

import type { TagScope } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { LIBRARY_TAGS_QUERY_KEY } from './library-tags-query-key';

/**
 * The tags one brand can use in the Library: its own, organization-wide tags
 * and legacy default tags, each with its asset count in that brand. Another
 * brand's tags are never returned, so the picker and the filter can never
 * offer one.
 */
export function useLibraryTags({
  brandId,
  isEnabled = true,
}: {
  /** Omit for the active brand. */
  brandId?: string;
  isEnabled?: boolean;
} = {}) {
  const { isSignedIn } = useAuthIdentity();
  const queryClient = useQueryClient();
  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  const {
    data: tags = [],
    isError,
    isLoading,
  } = useQuery<ITag[]>({
    enabled: isEnabled && Boolean(isSignedIn),
    queryFn: async ({ signal }) => {
      const service = await getTagsService();
      return service.findLibraryTags({ brandId, signal });
    },
    queryKey: [LIBRARY_TAGS_QUERY_KEY, brandId ?? 'active'],
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [LIBRARY_TAGS_QUERY_KEY] }),
    [queryClient],
  );

  /**
   * Create a tag, or get the existing one when the label is already taken in
   * that scope, so the caller can attach it in the same action.
   */
  const createTag = useCallback(
    async (
      label: string,
      scope?: TagScope.BRAND | TagScope.ORGANIZATION,
    ): Promise<ITag> => {
      const service = await getTagsService();
      const tag = await service.createLibraryTag(label, scope);
      await refresh();
      return tag;
    },
    [getTagsService, refresh],
  );

  return { createTag, isError, isLoading, refresh, tags };
}
