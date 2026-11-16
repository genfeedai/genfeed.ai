'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useMemo } from 'react';

const EMPTY_MODELS: readonly IModel[] = [];

interface RetiredModelsSnapshot {
  /** The retired row for a saved model key, or null when it is not retired. */
  getRetiredModel: (key: string | null | undefined) => IModel | null;
  isLoading: boolean;
}

/**
 * The retired catalog rows, by key. The model catalog hides them from
 * members, so a saved model that points at one reads this to show the
 * retired flag.
 */
export function useRetiredModels(): RetiredModelsSnapshot {
  const { organizationId } = useBrand();

  const query = useAuthedQuery<ModelsService, readonly IModel[]>({
    enabled: Boolean(organizationId),
    queryFn: async (service, signal) => {
      try {
        return await service.findRetired({ organizationId }, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load retired models', { error });
        }
        throw error;
      }
    },
    queryKey: ['retired-models', organizationId ?? null],
    service: (token: string) => ModelsService.getInstance(token),
  });

  const retiredByKey = useMemo(
    () => new Map((query.data ?? EMPTY_MODELS).map((m) => [m.key, m])),
    [query.data],
  );
  const getRetiredModel = useCallback(
    (key: string | null | undefined) =>
      key ? (retiredByKey.get(key) ?? null) : null,
    [retiredByKey],
  );

  return { getRetiredModel, isLoading: query.isLoading };
}
