'use client';

import type { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ModelsService } from '@services/ai/models.service';
import { useEffect, useState } from 'react';

const MODEL_PAGE_LIMIT = 100;

export interface UseStudioGenerateModelsReturn {
  isLoadingModels: boolean;
  models: readonly IModel[];
}

/**
 * Loads the active model registry rows for one generation category. Types
 * without a router-backed catalog (avatar) pass `null` and get an empty list.
 */
export function useStudioGenerateModels(
  category: ModelCategory | null,
): UseStudioGenerateModelsReturn {
  const [models, setModels] = useState<readonly IModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(Boolean(category));

  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  useEffect(() => {
    if (!category) {
      setModels([]);
      setIsLoadingModels(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    // Drop the previous category's catalog before fetching. Keeping it would
    // let `resolveModelKey` fall back to an image model on a video submit
    // during the window between the type switch and the new rows landing.
    setModels([]);
    setIsLoadingModels(true);

    void (async () => {
      try {
        const service = await getModelsService();
        const rows = await service.findAll(
          {
            category,
            isActive: true,
            limit: MODEL_PAGE_LIMIT,
            sort: 'label: 1',
          },
          controller.signal,
        );

        if (isCancelled || controller.signal.aborted) {
          return;
        }

        setModels(rows);
      } catch {
        if (!isCancelled) {
          setModels([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingModels(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [category, getModelsService]);

  return { isLoadingModels, models };
}
