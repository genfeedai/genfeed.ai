'use client';

import { ModelCategory } from '@genfeedai/contracts';
import { isImageEditModel } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ModelsService } from '@services/ai/models.service';
import { useEffect, useState } from 'react';

const MODEL_PAGE_LIMIT = 100;

export interface UseStudioGenerateModelsReturn {
  isLoadingModels: boolean;
  /** True only once `models` holds a successful fetch for the requested category. */
  isModelCatalogReady: boolean;
  models: readonly IModel[];
}

/**
 * Loads the active model registry rows for one generation category. Types
 * without a router-backed catalog (avatar) pass `null` and get an empty list.
 */
export function useStudioGenerateModels(
  category: ModelCategory | null,
  organizationId: string | undefined,
): UseStudioGenerateModelsReturn {
  const [models, setModels] = useState<readonly IModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(Boolean(category));
  const [loadedCategory, setLoadedCategory] = useState<ModelCategory | null>(
    null,
  );

  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  useEffect(() => {
    if (!category || !organizationId) {
      setModels([]);
      setLoadedCategory(null);
      setIsLoadingModels(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    // Drop the previous category's catalog before fetching. Keeping it would
    // let `resolveModelKey` fall back to an image model on a video submit
    // during the window between the type switch and the new rows landing.
    setModels([]);
    setLoadedCategory(null);
    setIsLoadingModels(true);

    void (async () => {
      try {
        const service = await getModelsService();
        const rows = await service.findAll(
          {
            category,
            isActive: true,
            limit: MODEL_PAGE_LIMIT,
            organizationId,
            sort: 'label: 1',
          },
          controller.signal,
        );

        if (isCancelled || controller.signal.aborted) {
          return;
        }

        setModels(
          category === ModelCategory.IMAGE_EDIT
            ? rows.filter((row) => isImageEditModel(row.key))
            : rows,
        );
        setLoadedCategory(category);
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
  }, [category, getModelsService, organizationId]);

  return {
    isLoadingModels,
    isModelCatalogReady: category !== null && loadedCategory === category,
    models,
  };
}
