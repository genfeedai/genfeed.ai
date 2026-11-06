'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { type ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';

interface WorkflowModelCatalogSnapshot {
  hasError: boolean;
  isLoading: boolean;
  models: readonly IModel[];
}

const EMPTY_MODELS: readonly IModel[] = [];

/**
 * Loads the callable catalog rows for the categories one workflow action can
 * run. The picker never sees a provider: the server routes the chosen model.
 *
 * Cached per viewer, organization and category set, so reopening the model
 * picker lists the catalog at once and refreshes it in the background.
 */
export function useWorkflowModelCatalog(
  categories: readonly ModelCategory[],
): WorkflowModelCatalogSnapshot {
  const { organizationId } = useBrand();
  const categoryQuery = categories.join(',');

  const catalogQuery = useAuthedQuery<ModelsService, readonly IModel[]>({
    enabled: Boolean(organizationId && categoryQuery),
    queryFn: async (service, signal) => {
      try {
        const rows = await service.findAllPages(
          {
            categories: categoryQuery,
            includeRetired: false,
            isActive: true,
            organizationId,
            sort: 'label: 1',
          },
          signal,
        );
        // A retired row dispatches to its successor, so it is not a choice the
        // step can honour.
        return rows.filter((row) => row.lifecycle !== ModelLifecycle.RETIRED);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load workflow model catalog', { error });
        }
        throw error;
      }
    },
    queryKey: [
      'workflow-model-catalog',
      organizationId ?? null,
      { categories: categoryQuery },
    ],
    service: (token: string) => ModelsService.getInstance(token),
  });

  const models = catalogQuery.data;
  return {
    // A failed background refresh keeps the catalog already listed.
    hasError: catalogQuery.isError && models === undefined,
    isLoading: catalogQuery.isLoading,
    models: models ?? EMPTY_MODELS,
  };
}
