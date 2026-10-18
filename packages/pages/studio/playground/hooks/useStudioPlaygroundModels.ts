'use client';

import { ModelCategory } from '@genfeedai/contracts';
import {
  isImageEditModel,
  isVoiceSpeechModel,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ModelsService } from '@services/ai/models.service';
import { EnvironmentService } from '@services/core/environment.service';
import { useEffect, useRef, useState } from 'react';

const MODEL_PAGE_LIMIT = 100;

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
  rows: readonly IModel[],
): readonly IModel[] {
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
 */
export function useStudioPlaygroundModels(
  category: ModelCategory | null,
  organizationId: string | undefined,
): UseStudioPlaygroundModelsReturn {
  const { orgId, userId, sessionId } = useAuthIdentity();
  const ownerKey = JSON.stringify([
    category,
    organizationId,
    orgId,
    userId,
    sessionId,
    EnvironmentService.apiEndpoint,
  ]);
  const ownerRef = useRef({ key: ownerKey, epoch: 0 });
  if (ownerRef.current.key !== ownerKey)
    ownerRef.current = { key: ownerKey, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;
  const [snapshot, setSnapshot] = useState({
    owner,
    models: [] as readonly IModel[],
    isLoadingModels: Boolean(category && organizationId),
    isModelCatalogReady: false,
  });
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  useEffect(() => {
    if (!category || !organizationId) {
      setSnapshot({
        owner,
        models: [],
        isLoadingModels: false,
        isModelCatalogReady: false,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;
    const canApply = () =>
      !isCancelled && !controller.signal.aborted && ownerRef.current === owner;
    setSnapshot({
      owner,
      models: [],
      isLoadingModels: true,
      isModelCatalogReady: false,
    });

    void (async () => {
      try {
        const service = await getModelsService();
        if (!canApply()) return;
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
        if (!canApply()) return;
        setSnapshot({
          owner,
          models: filterCategoryRows(category, rows),
          isLoadingModels: false,
          isModelCatalogReady: true,
        });
      } catch {
        if (canApply()) {
          setSnapshot({
            owner,
            models: [],
            isLoadingModels: false,
            isModelCatalogReady: false,
          });
        }
      } finally {
        if (canApply()) {
          setSnapshot((current) =>
            canApply() && current.owner === owner
              ? { ...current, isLoadingModels: false }
              : current,
          );
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [category, getModelsService, organizationId, owner]);

  return snapshot.owner === owner
    ? {
        isLoadingModels: snapshot.isLoadingModels,
        isModelCatalogReady: snapshot.isModelCatalogReady,
        models: snapshot.models,
      }
    : {
        isLoadingModels: Boolean(category && organizationId),
        isModelCatalogReady: false,
        models: [],
      };
}
