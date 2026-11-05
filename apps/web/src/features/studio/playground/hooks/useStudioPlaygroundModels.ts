'use client';

import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import {
  isImageEditModel,
  isVoiceSpeechModel,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ModelsService } from '@services/ai/models.service';
import { EnvironmentService } from '@services/core/environment.service';

const MODEL_PAGE_LIMIT = 100;
const EMPTY_MODELS: readonly IModel[] = [];

export interface UseStudioPlaygroundModelsReturn {
  isLoadingModels: boolean;
  /** True only once `models` holds a successful fetch for the requested category. */
  isModelCatalogReady: boolean;
  models: readonly IModel[];
}

/**
 * The IMAGE_EDIT and VOICE categories hold rows Studio cannot drive for this
 * type (non-edit image rows, avatar rows), so they keep only supported keys.
 */
function filterCategoryRows(
  category: ModelCategory,
  allRows: readonly IModel[],
): readonly IModel[] {
  // A retired row dispatches to its successor, so the quote never matches the
  // row the operator picked. It is not a choice Studio can honour.
  const rows = allRows.filter(
    (row) => row.lifecycle !== ModelLifecycle.RETIRED,
  );
  if (category === ModelCategory.IMAGE_EDIT) {
    return rows.filter((row) => isImageEditModel(row.key));
  }
  if (category === ModelCategory.VOICE) {
    return rows.filter((row) => isVoiceSpeechModel(row.key));
  }
  return rows;
}

/**
 * Loads the active model registry rows for one generation category. Types
 * without a router-backed catalog (avatar) pass `null` and get an empty list.
 *
 * The catalog is cached per category, organization, session and API, so a
 * return to Studio paints the last catalog at once and refreshes it in the
 * background. Another scope never sees it, and a superseded read is cancelled.
 */
export function useStudioPlaygroundModels(
  category: ModelCategory | null,
  organizationId: string | undefined,
): UseStudioPlaygroundModelsReturn {
  const { sessionId } = useAuthIdentity();
  const query = useAuthedQuery<ModelsService, readonly IModel[]>({
    enabled: Boolean(category && organizationId),
    queryFn: async (service, signal) => {
      // A read superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      if (!category || !organizationId) {
        return EMPTY_MODELS;
      }
      const rows = await service.findAll(
        {
          category,
          includeRetired: false,
          isActive: true,
          limit: MODEL_PAGE_LIMIT,
          organizationId,
          sort: 'label: 1',
        },
        signal,
      );
      return filterCategoryRows(category, rows);
    },
    queryKey: [
      'studio-models',
      category,
      organizationId ?? null,
      sessionId ?? null,
      EnvironmentService.apiEndpoint,
    ],
    service: (token: string) => ModelsService.getInstance(token),
  });

  if (!category || !organizationId) {
    return {
      isLoadingModels: false,
      isModelCatalogReady: false,
      models: EMPTY_MODELS,
    };
  }

  return {
    isLoadingModels: query.isLoading,
    isModelCatalogReady: query.data !== undefined,
    models: query.data ?? EMPTY_MODELS,
  };
}
