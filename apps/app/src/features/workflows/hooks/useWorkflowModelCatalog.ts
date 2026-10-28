'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { type ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

interface WorkflowModelCatalogSnapshot {
  hasError: boolean;
  isLoading: boolean;
  models: readonly IModel[];
}

const EMPTY_SNAPSHOT: WorkflowModelCatalogSnapshot = {
  hasError: false,
  isLoading: false,
  models: [],
};

/**
 * Loads the callable catalog rows for the categories one workflow action can
 * run. The picker never sees a provider: the server routes the chosen model.
 */
export function useWorkflowModelCatalog(
  categories: readonly ModelCategory[],
): WorkflowModelCatalogSnapshot {
  const { organizationId } = useBrand();
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );
  const [snapshot, setSnapshot] =
    useState<WorkflowModelCatalogSnapshot>(EMPTY_SNAPSHOT);
  const categoryQuery = categories.join(',');

  useEffect(() => {
    if (!organizationId || !categoryQuery) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    const controller = new AbortController();
    setSnapshot({ hasError: false, isLoading: true, models: [] });

    void (async () => {
      try {
        const service = await getModelsService();
        const rows = await service.findAllPages(
          {
            categories: categoryQuery,
            includeRetired: false,
            isActive: true,
            organizationId,
            sort: 'label: 1',
          },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        // A retired row dispatches to its successor, so it is not a choice the
        // step can honour.
        setSnapshot({
          hasError: false,
          isLoading: false,
          models: rows.filter(
            (row) => row.lifecycle !== ModelLifecycle.RETIRED,
          ),
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load workflow model catalog', { error });
        setSnapshot({ hasError: true, isLoading: false, models: [] });
      }
    })();

    return () => controller.abort();
  }, [categoryQuery, getModelsService, organizationId]);

  return snapshot;
}
