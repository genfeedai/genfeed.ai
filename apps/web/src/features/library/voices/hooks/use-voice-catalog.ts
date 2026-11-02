'use client';

import { IngredientStatus, type VoiceProvider } from '@genfeedai/contracts';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useCallback } from 'react';

const DEFAULT_VOICE_CATALOG_STATUS = [
  IngredientStatus.DRAFT,
  IngredientStatus.UPLOADED,
  IngredientStatus.PROCESSING,
  IngredientStatus.GENERATED,
  IngredientStatus.FAILED,
  'completed',
];

const LOAD_ERROR_MESSAGE = 'Voices could not be loaded.';
const EMPTY_VOICES: Voice[] = [];

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
  const query = {
    isActive,
    limit,
    page,
    providers,
    search,
    status,
  };
  // Every filter is in the key by value, so inline array literals do not
  // refetch, and coming back to a voice surface paints the cached catalog while
  // it refreshes. Paging within one filter set keeps the current page on screen.
  const scopeKey = [
    'voices',
    'catalog',
    { isActive, isPaginated, providers, status },
  ];
  const voicesQuery = useAuthedQuery({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      try {
        // The paged UI drives `page`/`limit` itself; every other caller renders
        // the whole catalog and has to walk the server pages to get it.
        return isPaginated
          ? await service.findAll(query, signal)
          : await service.findAllPages(query, signal);
      } catch (error) {
        logger.error('Failed to fetch voices', error);
        throw error;
      }
    },
    queryKey: [...scopeKey, { limit, page, search }],
    service: (token: string) => VoicesService.getInstance(token),
  });

  const { refetch } = voicesQuery;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    error: voicesQuery.isError ? LOAD_ERROR_MESSAGE : null,
    isLoading: voicesQuery.isLoading,
    refresh,
    voices: voicesQuery.isError
      ? EMPTY_VOICES
      : (voicesQuery.data ?? EMPTY_VOICES),
  };
}
