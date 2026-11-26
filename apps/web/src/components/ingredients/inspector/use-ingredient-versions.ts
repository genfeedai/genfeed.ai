'use client';

import type { IIngredientVersionHistory } from '@genfeedai/contracts/interfaces';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  useAuthedQuery,
  viewerKeyPart,
} from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseIngredientVersionsResult } from '@/props/content/ingredient.props';

/** One cache entry per asset; Library and Studio share it. */
const VERSIONS_QUERY_KEY = 'ingredient-versions';

function createIngredientsService(token: string): IngredientsService {
  return IngredientsService.getInstance(token);
}

/**
 * The ordered versions of an asset and which one is active (#7397). The
 * Library inspector and the Studio inspector read the same cache entry, so both
 * show the same order and the same active version; making a version active
 * writes the answer the server returns straight into it.
 */
export function useIngredientVersions(
  ingredientId: string,
): UseIngredientVersionsResult {
  const translate = useTranslations('pages.library.inspector.versions');
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuthIdentity();
  const getIngredientsService = useAuthedService(createIngredientsService);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  const query = useAuthedQuery<IngredientsService, IIngredientVersionHistory>({
    queryFn: async (service, signal) => {
      try {
        return await service.findVersions(ingredientId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error(
            `GET /ingredients/${ingredientId}/versions failed`,
            error,
          );
        }
        throw error;
      }
    },
    queryKey: [VERSIONS_QUERY_KEY, ingredientId],
    service: createIngredientsService,
  });

  const activate = useCallback(
    async (versionId: string): Promise<boolean> => {
      if (isBusyRef.current) {
        return false;
      }
      isBusyRef.current = true;
      setIsBusy(true);
      try {
        const service = await getIngredientsService();
        const history = await service.setActiveVersion(ingredientId, versionId);
        // Every member of the history reads the same answer.
        for (const entry of history.versions) {
          // The read appends the viewer to its key; the write must match it.
          queryClient.setQueryData(
            [VERSIONS_QUERY_KEY, entry.id, viewerKeyPart(userId, orgId)],
            { ...history, ingredientId: entry.id },
          );
        }
        const number = history.versions.find((entry) => entry.isActive)?.number;
        notifications.success(translate('activated', { number: number ?? 1 }));
        return true;
      } catch (error: unknown) {
        logger.error(
          `PATCH /ingredients/${ingredientId}/versions/active failed`,
          error,
        );
        notifications.error(translate('activateFailed'));
        return false;
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [
      getIngredientsService,
      ingredientId,
      notifications,
      orgId,
      queryClient,
      translate,
      userId,
    ],
  );

  return {
    activate,
    hasError: query.isError && query.data === undefined,
    history: query.data ?? null,
    isBusy,
    isLoading: query.isPending,
  };
}
