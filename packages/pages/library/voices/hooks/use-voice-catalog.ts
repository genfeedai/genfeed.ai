'use client';

import { IngredientStatus, type VoiceProvider } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_VOICE_CATALOG_STATUS = [
  IngredientStatus.DRAFT,
  IngredientStatus.UPLOADED,
  IngredientStatus.PROCESSING,
  IngredientStatus.GENERATED,
  IngredientStatus.FAILED,
  'completed',
];

interface UseVoiceCatalogOptions {
  isActive?: boolean;
  /** Serve one server page (paged UI) instead of the whole catalog. */
  isPaginated?: boolean;
  limit?: number;
  page?: number;
  providers?: VoiceProvider[];
  search?: string;
  status?: string[];
}

export function useVoiceCatalog({
  isActive = true,
  isPaginated = false,
  limit,
  page,
  providers,
  search,
  status = DEFAULT_VOICE_CATALOG_STATUS,
}: UseVoiceCatalogOptions = {}) {
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  // `providers` and `status` are routinely passed as inline array literals, so
  // their identity changes on every render. Keying on their contents keeps
  // `refresh` stable: otherwise a completed fetch sets a new `voices` array,
  // re-renders, rebuilds the literal, invalidates `refresh`, and re-fires the
  // effect — an endless refetch loop for any caller that does not memoize.
  const providersKey = providers?.join('\u0001');
  const statusKey = status.join('\u0001');
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on contents, not identity
  const stableProviders = useMemo(() => providers, [providersKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on contents, not identity
  const stableStatus = useMemo(() => status, [statusKey]);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const service = await getVoicesService();
      const query = {
        isActive,
        limit,
        page,
        providers: stableProviders,
        search,
        status: stableStatus,
      };
      // The paged UI drives `page`/`limit` itself; every other caller renders
      // the whole catalog and has to walk the server pages to get it.
      const nextVoices = isPaginated
        ? await service.findAll(query)
        : await service.findAllPages(query);
      setVoices(nextVoices);
      setError(null);
    } catch (error) {
      logger.error('Failed to fetch voices', error);
      setVoices([]);
      setError('Voices could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [
    getVoicesService,
    isActive,
    isPaginated,
    limit,
    page,
    search,
    stableProviders,
    stableStatus,
  ]);

  useEffect(() => {
    refresh().catch((error) => {
      logger.error('Failed to initialize voices', error);
    });
  }, [refresh]);

  return {
    error,
    isLoading,
    refresh,
    voices,
  };
}
