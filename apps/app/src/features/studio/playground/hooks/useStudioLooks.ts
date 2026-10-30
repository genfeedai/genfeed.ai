'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IStudioLook,
  StudioLookAssetType,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { buildStudioLookPayload } from '@genfeedai/helpers/studio-look.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StudioLooksService } from '@services/content/studio-looks.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface StudioLooksSnapshot {
  error: string | null;
  isLoading: boolean;
  looks: readonly IStudioLook[];
  scopeKey: string;
  epoch: number;
}

interface StudioLooksMutationState {
  deletingId: string | null;
  error: string | null;
  isSaving: boolean;
  scopeKey: string;
  epoch: number;
}

export interface UseStudioLooksReturn {
  deleteLook: (id: string) => Promise<boolean>;
  deletingId: string | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  looks: readonly IStudioLook[];
  saveLook: (label: string, values: GenerationSetupValues) => Promise<boolean>;
}

export function isStudioLookAssetType(
  type: StudioPlaygroundType,
): type is StudioLookAssetType {
  return type === 'image' || type === 'video';
}

export {
  buildStudioLookPayload,
  presetToGenerationSetupValues,
} from '@genfeedai/helpers/studio-look.helper';

export function useStudioLooks(
  type: StudioPlaygroundType,
): UseStudioLooksReturn {
  const { brandId, organizationId } = useBrand();
  const { userId, sessionId } = useAuthIdentity();
  const assetType = isStudioLookAssetType(type) ? type : null;
  const scopeKey = assetType
    ? JSON.stringify([
        organizationId,
        brandId,
        userId,
        sessionId,
        EnvironmentService.apiEndpoint,
        assetType,
      ])
    : '';
  const ownerRef = useRef({ scopeKey, epoch: 0 });
  if (ownerRef.current.scopeKey !== scopeKey)
    ownerRef.current = { scopeKey, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;
  const isMounted = useRef(true);
  const isCurrentOwner = useCallback(
    () => isMounted.current && ownerRef.current === owner,
    [owner],
  );

  const [snapshot, setSnapshot] = useState<StudioLooksSnapshot>({
    error: null,
    isLoading: false,
    looks: [],
    scopeKey: '',
    epoch: -1,
  });
  const [mutation, setMutation] = useState<StudioLooksMutationState>({
    deletingId: null,
    error: null,
    isSaving: false,
    scopeKey: '',
    epoch: -1,
  });

  const getStudioLooksService = useAuthedService((token: string) =>
    StudioLooksService.getInstance(token),
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCurrentOwner()) return;
    if (!scopeKey || !assetType || !brandId || !organizationId) {
      setSnapshot({
        error: null,
        isLoading: false,
        looks: [],
        scopeKey,
        epoch: owner.epoch,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;
    const canApply = () =>
      !isCancelled && !controller.signal.aborted && isCurrentOwner();

    setSnapshot({
      error: null,
      isLoading: true,
      looks: [],
      scopeKey,
      epoch: owner.epoch,
    });
    setMutation({
      deletingId: null,
      error: null,
      isSaving: false,
      scopeKey,
      epoch: owner.epoch,
    });

    void (async () => {
      try {
        const service = await getStudioLooksService();
        if (!canApply()) return;
        const looks = await service.findForAssetType(
          assetType,
          controller.signal,
        );
        if (canApply()) {
          setSnapshot({
            error: null,
            isLoading: false,
            looks,
            scopeKey,
            epoch: owner.epoch,
          });
        }
      } catch (error) {
        if (canApply()) {
          logger.error('Failed to load Studio Looks', error);
          setSnapshot({
            error: 'Saved Looks could not be loaded.',
            isLoading: false,
            looks: [],
            scopeKey,
            epoch: owner.epoch,
          });
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [
    assetType,
    brandId,
    getStudioLooksService,
    isCurrentOwner,
    organizationId,
    owner,
    scopeKey,
  ]);

  const saveLook = useCallback(
    async (label: string, values: GenerationSetupValues) => {
      if (!assetType || !scopeKey || !label.trim() || !isCurrentOwner()) {
        return false;
      }
      const payload = buildStudioLookPayload(label, assetType, values);
      setMutation({
        deletingId: null,
        error: null,
        isSaving: true,
        scopeKey,
        epoch: owner.epoch,
      });
      try {
        const service = await getStudioLooksService();
        if (!isCurrentOwner()) return false;
        const created = await service.post(payload);
        if (!isCurrentOwner()) return false;
        setSnapshot((current) =>
          isCurrentOwner() &&
          current.scopeKey === scopeKey &&
          current.epoch === owner.epoch
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
          epoch: owner.epoch,
        });
        return true;
      } catch (error) {
        if (!isCurrentOwner()) return false;
        logger.error('Failed to save Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be saved. Your settings are unchanged.',
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return false;
      }
    },
    [assetType, getStudioLooksService, isCurrentOwner, owner, scopeKey],
  );

  const deleteLook = useCallback(
    async (id: string) => {
      if (!scopeKey || !isCurrentOwner()) {
        return false;
      }
      setMutation({
        deletingId: id,
        error: null,
        isSaving: false,
        scopeKey,
        epoch: owner.epoch,
      });
      try {
        const service = await getStudioLooksService();
        if (!isCurrentOwner()) return false;
        await service.removeLook(id);
        if (!isCurrentOwner()) return false;
        setSnapshot((current) =>
          isCurrentOwner() &&
          current.scopeKey === scopeKey &&
          current.epoch === owner.epoch
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
          epoch: owner.epoch,
        });
        return true;
      } catch (error) {
        if (!isCurrentOwner()) return false;
        logger.error('Failed to delete Studio Look', error);
        setMutation({
          deletingId: null,
          error: 'This Look could not be deleted.',
          isSaving: false,
          scopeKey,
          epoch: owner.epoch,
        });
        return false;
      }
    },
    [getStudioLooksService, isCurrentOwner, owner, scopeKey],
  );

  return useMemo(() => {
    const currentSnapshot =
      snapshot.scopeKey === scopeKey && snapshot.epoch === owner.epoch
        ? snapshot
        : { error: null, isLoading: Boolean(scopeKey), looks: [] };
    const currentMutation =
      mutation.scopeKey === scopeKey && mutation.epoch === owner.epoch
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
  }, [deleteLook, mutation, owner, saveLook, scopeKey, snapshot]);
}
