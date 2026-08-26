'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IStudioLook,
  StudioGenerateSettings,
  StudioGenerateType,
  StudioLookAssetType,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioLooksService } from '@services/content/studio-looks.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface StudioLooksSnapshot {
  error: string | null;
  isLoading: boolean;
  looks: readonly IStudioLook[];
  scopeKey: string;
}

interface StudioLooksMutationState {
  deletingId: string | null;
  error: string | null;
  isSaving: boolean;
  scopeKey: string;
}

export interface UseStudioLooksReturn {
  deleteLook: (id: string) => Promise<boolean>;
  deletingId: string | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  looks: readonly IStudioLook[];
  saveLook: (
    label: string,
    settings: StudioGenerateSettings,
  ) => Promise<boolean>;
}

export function isStudioLookAssetType(
  type: StudioGenerateType,
): type is StudioLookAssetType {
  return type === 'image' || type === 'video';
}

export function buildStudioLookPayload(
  label: string,
  type: StudioLookAssetType,
  settings: StudioGenerateSettings,
) {
  return {
    assetType: type,
    camera: settings.camera ?? '',
    cameraMovement: type === 'video' ? (settings.cameraMovement ?? '') : null,
    label: label.trim(),
    lens: settings.lens ?? '',
    lighting: settings.lighting ?? '',
    mood: settings.mood ?? '',
    promptTemplate: settings.promptTemplate ?? '',
    scene: settings.scene ?? '',
    style: settings.style ?? '',
  };
}

/** Apply only Look-owned fields; prompt, model, Output, and Identity stay put. */
export function studioLookToSettingsPatch(
  look: IStudioLook,
): Partial<StudioGenerateSettings> {
  return {
    camera: look.camera || undefined,
    cameraMovement:
      look.assetType === 'video' ? look.cameraMovement || undefined : undefined,
    lens: look.lens || undefined,
    lighting: look.lighting || undefined,
    mood: look.mood || undefined,
    promptTemplate: look.promptTemplate || undefined,
    scene: look.scene || undefined,
    style: look.style || undefined,
  };
}

export function useStudioLooks(type: StudioGenerateType): UseStudioLooksReturn {
  const { brandId, organizationId } = useBrand();
  const assetType = isStudioLookAssetType(type) ? type : null;
  const scopeKey = assetType
    ? `${organizationId}\u0001${brandId}\u0001${assetType}`
    : '';

  const [snapshot, setSnapshot] = useState<StudioLooksSnapshot>({
    error: null,
    isLoading: false,
    looks: [],
    scopeKey: '',
  });
  const [mutation, setMutation] = useState<StudioLooksMutationState>({
    deletingId: null,
    error: null,
    isSaving: false,
    scopeKey: '',
  });

  const getStudioLooksService = useAuthedService((token: string) =>
    StudioLooksService.getInstance(token),
  );

  useEffect(() => {
    if (!scopeKey || !assetType || !brandId || !organizationId) {
      setSnapshot({
        error: null,
        isLoading: false,
        looks: [],
        scopeKey,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setSnapshot({
      error: null,
      isLoading: true,
      looks: [],
      scopeKey,
    });
    setMutation({
      deletingId: null,
      error: null,
      isSaving: false,
      scopeKey,
    });

    void (async () => {
      try {
        const service = await getStudioLooksService();
        const looks = await service.findForAssetType(
          assetType,
          controller.signal,
        );
        if (!isCancelled && !controller.signal.aborted) {
          setSnapshot({
            error: null,
            isLoading: false,
            looks,
            scopeKey,
          });
        }
      } catch (error) {
        if (!isCancelled && !controller.signal.aborted) {
          logger.error('Failed to load Studio Looks', error);
          setSnapshot({
            error: 'Saved Looks could not be loaded.',
            isLoading: false,
            looks: [],
            scopeKey,
          });
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [assetType, brandId, getStudioLooksService, organizationId, scopeKey]);

  const saveLook = useCallback(
    async (label: string, settings: StudioGenerateSettings) => {
      if (!assetType || !scopeKey || !label.trim()) {
        return false;
      }

      setMutation({
        deletingId: null,
        error: null,
        isSaving: true,
        scopeKey,
      });
      try {
        const service = await getStudioLooksService();
        const created = await service.post(
          buildStudioLookPayload(label, assetType, settings),
        );
        setSnapshot((current) =>
          current.scopeKey === scopeKey
            ? {
                ...current,
                looks: [created, ...current.looks],
              }
            : current,
        );
        setMutation({
          deletingId: null,
          error: null,
          isSaving: false,
          scopeKey,
        });
        return true;
      } catch (error) {
        logger.error('Failed to save Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be saved. Your settings are unchanged.',
          isSaving: false,
          scopeKey,
        });
        return false;
      }
    },
    [assetType, getStudioLooksService, scopeKey],
  );

  const deleteLook = useCallback(
    async (id: string) => {
      if (!scopeKey) {
        return false;
      }

      setMutation({
        deletingId: id,
        error: null,
        isSaving: false,
        scopeKey,
      });
      try {
        const service = await getStudioLooksService();
        await service.removeLook(id);
        setSnapshot((current) =>
          current.scopeKey === scopeKey
            ? {
                ...current,
                looks: current.looks.filter((look) => look.id !== id),
              }
            : current,
        );
        setMutation({
          deletingId: null,
          error: null,
          isSaving: false,
          scopeKey,
        });
        return true;
      } catch (error) {
        logger.error('Failed to delete Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be deleted.',
          isSaving: false,
          scopeKey,
        });
        return false;
      }
    },
    [getStudioLooksService, scopeKey],
  );

  return useMemo(() => {
    const currentSnapshot =
      snapshot.scopeKey === scopeKey
        ? snapshot
        : { error: null, isLoading: Boolean(scopeKey), looks: [] };
    const currentMutation =
      mutation.scopeKey === scopeKey
        ? mutation
        : { deletingId: null, error: null, isSaving: false };

    return {
      deleteLook,
      deletingId: currentMutation.deletingId,
      error: currentMutation.error ?? currentSnapshot.error,
      isLoading: currentSnapshot.isLoading,
      isSaving: currentMutation.isSaving,
      looks: currentSnapshot.looks,
      saveLook,
    };
  }, [deleteLook, mutation, saveLook, scopeKey, snapshot]);
}
