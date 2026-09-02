'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { ChannelTargetInput } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  CreatePostingSetInput,
  IPostingSet,
} from '@genfeedai/contracts/interfaces';
import { PostingSetsService } from '@genfeedai/services/content/posting-sets.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type {
  ExpandedPostingSetTarget,
  UsePostingSetsOptions,
  UsePostingSetsResult,
} from '@props/content/posting-sets.props';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

export const POSTING_SETS_QUERY_KEY = 'posting-sets';

function readExpandedTargets(value: unknown): ExpandedPostingSetTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as ChannelTargetInput;
    if (
      typeof record.credentialId !== 'string' ||
      typeof record.platform !== 'string'
    ) {
      return [];
    }
    return [
      {
        ...(record.attachments ? { attachments: record.attachments } : {}),
        ...(record.caption ? { caption: record.caption } : {}),
        credentialId: record.credentialId,
        ...(typeof record.order === 'number' ? { order: record.order } : {}),
        platform: record.platform,
        ...(record.scheduledDate
          ? { scheduledDate: record.scheduledDate }
          : {}),
        ...(record.settings ? { settings: record.settings } : {}),
        ...(record.timezone ? { timezone: record.timezone } : {}),
        ...(record.visibility ? { visibility: record.visibility } : {}),
      },
    ];
  });
}

export function usePostingSets(
  options: UsePostingSetsOptions = {},
): UsePostingSetsResult {
  const { autoLoad = true } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId } = useBrand();
  const { isReady, organizationId, pageScope } = useCollectionScope();
  const queryClient = useQueryClient();
  const [expandError, setExpandError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const getService = useAuthedService((token: string) =>
    PostingSetsService.getInstance(token),
  );
  const isEnabled = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });

  const queryKey = useMemo(
    () => [POSTING_SETS_QUERY_KEY, organizationId, brandId ?? null],
    [brandId, organizationId],
  );

  const { data: sets = [], isLoading } = useQuery({
    enabled: autoLoad && isEnabled && Boolean(isSignedIn),
    queryFn: async () => {
      const service = await getService();
      return (await service.findAll({
        ...toBrandListParams({ brandId }),
        isEnabled: true,
        limit: 100,
      })) as IPostingSet[];
    },
    queryKey,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreatePostingSetInput) => {
      const service = await getService();
      return service.post({
        ...input,
        ...(brandId && !input.brandId ? { brandId } : {}),
      }) as Promise<IPostingSet>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [POSTING_SETS_QUERY_KEY],
      });
    },
  });

  const expandSet = useCallback(
    async (
      id: string,
      data: { scheduledDate?: string; timezone?: string } = {},
    ): Promise<ExpandedPostingSetTarget[]> => {
      setExpandError(null);
      setIsExpanding(true);
      try {
        const service = await getService();
        const result = await service.expand(id, data);
        return readExpandedTargets(result.targets);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not expand this posting set.';
        setExpandError(message);
        throw error;
      } finally {
        setIsExpanding(false);
      }
    },
    [getService],
  );

  return {
    createSet: createMutation.mutateAsync,
    expandError,
    expandSet,
    isExpanding,
    isLoading: !isEnabled || isLoading,
    isSaving: createMutation.isPending,
    saveError:
      createMutation.error instanceof Error
        ? createMutation.error.message
        : createMutation.error
          ? 'Could not save this posting set.'
          : null,
    sets,
  };
}
