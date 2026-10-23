'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { UpdateGenerationHarnessSettings } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { GenerationHarnessService } from '@services/ai/generation-harness.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

const SETTINGS_QUERY_KEY = 'generation-harness-settings';
const SETTINGS_STALE_TIME_MS = 60_000;
const SETTINGS_GC_TIME_MS = 30 * 60_000;

/**
 * Saved prompt-enhancement settings for the current organization and brand.
 * Cached per organization + brand so reopening the Brand popover shows the
 * last value instantly; a stale cache refetches in the background (on mount
 * and on window focus, which picks up changes an agent made elsewhere).
 */
export function useGenerationHarnessSettings(isOpen: boolean) {
  const { brandId, organizationId } = useBrand();
  const queryClient = useQueryClient();
  const getService = useAuthedService((token) =>
    GenerationHarnessService.getInstance(token),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const queryKey = [SETTINGS_QUERY_KEY, organizationId, brandId ?? null];
  const query = useQuery({
    enabled: isOpen && !!organizationId,
    gcTime: SETTINGS_GC_TIME_MS,
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service.getSettings(brandId, signal);
    },
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: SETTINGS_STALE_TIME_MS,
  });
  const { data: settings = null, refetch } = query;

  const save = useCallback(
    async (
      scope: UpdateGenerationHarnessSettings['scope'],
      isEnabled: boolean | null,
    ) => {
      if (!organizationId || !isOpen || savingRef.current || !settings) return;
      const savedKey = [SETTINGS_QUERY_KEY, organizationId, brandId ?? null];
      savingRef.current = true;
      setIsSaving(true);
      setSaveError(null);
      try {
        const service = await getService();
        await service.updateSettings({
          scope,
          isEnabled,
          ...(brandId ? { brandId } : {}),
        });
        const value = await service.getSettings(brandId);
        queryClient.setQueryData(savedKey, value);
        // The organization default shapes every brand's effective value.
        await queryClient.invalidateQueries({
          predicate: (cached) =>
            cached.queryKey[0] === SETTINGS_QUERY_KEY &&
            cached.queryKey[1] === organizationId &&
            cached.queryKey[2] !== (brandId ?? null),
          refetchType: 'none',
        });
      } catch {
        setSaveError(
          'Could not confirm the saved setting. Refresh to check, then try again.',
        );
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [brandId, getService, isOpen, organizationId, queryClient, settings],
  );

  const refresh = useCallback(() => {
    setSaveError(null);
    void refetch();
  }, [refetch]);

  let error = saveError;
  if (isOpen && !organizationId) {
    error = 'Choose an organization to edit prompt enhancement settings.';
  } else if (!error && query.isError && !settings) {
    error = 'Could not load prompt enhancement settings.';
  }

  return {
    brandId,
    error,
    // Only the first load shows a spinner; a cached value renders at once.
    isLoading: query.isLoading,
    isSaving,
    refresh,
    save,
    settings,
  };
}
