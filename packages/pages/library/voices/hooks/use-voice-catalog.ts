'use client';

import { IngredientStatus, VoiceProvider } from '@genfeedai/enums';
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
  limit?: number;
  page?: number;
  pagination?: boolean;
  providers?: VoiceProvider[];
  search?: string;
  status?: string[];
  voiceSource?: Array<'catalog' | 'cloned' | 'generated'>;
}

export function useVoiceCatalog({
  isActive = true,
  limit,
  page,
  pagination = false,
  providers,
  search,
  status = DEFAULT_VOICE_CATALOG_STATUS,
  voiceSource,
}: UseVoiceCatalogOptions = {}) {
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = await getVoicesService();
      const nextVoices = await service.findAll({
        isActive,
        limit,
        page,
        pagination,
        providers,
        search,
        status,
        voiceSource,
      });
      setVoices(nextVoices);
    } catch (error) {
      logger.error('Failed to fetch voices', error);
      setVoices([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    getVoicesService,
    isActive,
    limit,
    page,
    pagination,
    providers,
    search,
    status,
    voiceSource,
  ]);

  useEffect(() => {
    refresh().catch((error) => {
      logger.error('Failed to initialize voices', error);
    });
  }, [refresh]);

  return {
    isLoading,
    refresh,
    voices,
  };
}
