'use client';

import type {
  ISavedAd,
  SaveAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { SavedAdsService } from '@services/ads/saved-ads.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useSavedAds() {
  const { brandId, isReady, organizationId } = useCollectionScope();
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    SavedAdsService.getInstance(token),
  );
  const queryKey = ['saved-ads', organizationId, brandId] as const;
  const query = useQuery({
    enabled: isReady && Boolean(brandId),
    queryFn: async () => (await getService()).list(brandId as string),
    queryKey,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: async (inputs: SaveAdInput[]) =>
      (await getService()).save(inputs),
    onSuccess: invalidate,
  });
  const noteMutation = useMutation({
    mutationFn: async (inputs: UpdateSavedAdNoteInput[]) =>
      (await getService()).updateNotes(inputs),
    onSuccess: invalidate,
  });
  const unsaveMutation = useMutation({
    mutationFn: async (inputs: ISavedAd[]) =>
      (await getService()).unsave(
        inputs.map((item) => ({ brandId: item.brandId, id: item.id })),
      ),
    onSuccess: invalidate,
  });

  return {
    brandId,
    error: query.error,
    isLoading: query.isLoading,
    isMutating:
      saveMutation.isPending ||
      noteMutation.isPending ||
      unsaveMutation.isPending,
    refetch: query.refetch,
    save: saveMutation.mutateAsync,
    savedAds: query.data ?? [],
    unsave: unsaveMutation.mutateAsync,
    updateNotes: noteMutation.mutateAsync,
  };
}
