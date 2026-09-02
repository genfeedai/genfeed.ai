'use client';

import { IngredientStatus, type VoiceProvider } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Voice } from '@models/ingredients/voice.model';
import { logger } from '@services/core/logger.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useCallback, useEffect, useState } from 'react';

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
        providers,
        search,
        status,
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
    providers,
    search,
    status,
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
